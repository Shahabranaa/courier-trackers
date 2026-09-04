import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchTcsPaymentStatus, getTcsBrandConfig } from "@/lib/tcs";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const trackingNumber = params.get("trackingNumber")?.trim();
  const brandId = params.get("brandId")?.trim();
  if (!trackingNumber) return NextResponse.json({ error: "Tracking number is required" }, { status: 400 });
  try {
    const brandConfig = brandId ? await getTcsBrandConfig(brandId) : null;
    const customerNumber = brandConfig?.customerNumber || params.get("customerNumber")?.trim() || "";
    if (!customerNumber) return NextResponse.json({ error: "TCS customer number is not configured for this brand" }, { status: 400 });
    const raw = await fetchTcsPaymentStatus(customerNumber, trackingNumber, brandConfig?.credentials);
    const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const detail = Array.isArray(record.detail) && record.detail[0] && typeof record.detail[0] === "object"
      ? record.detail[0] as Record<string, unknown>
      : null;
    const code = String(detail?.["payment status"] || "N").toUpperCase();
    const existing = await prisma.paymentStatus.findUnique({ where: { trackingNumber } });
    let previous: Record<string, unknown> = {};
    try {
      previous = existing?.data ? JSON.parse(existing.data) : {};
    } catch {
      previous = {};
    }
    const normalized = {
      ...previous,
      trackingNumber,
      paymentStatus: code === "Y" ? "PAID" : "UNPAID",
      paid: code === "Y",
      settle: code === "Y",
      detail,
    };
    await prisma.paymentStatus.upsert({
      where: { trackingNumber },
      update: { data: JSON.stringify(normalized), updatedAt: new Date() },
      create: { trackingNumber, data: JSON.stringify(normalized) },
    });
    return NextResponse.json(normalized);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment lookup failed" }, { status: 502 });
  }
}