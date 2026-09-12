import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMnpBrandConfig, mnpRows, saveMnpTrackingResult, trackMnpBulk } from "@/lib/mnp";

async function canAccessBrand(user: { id: string; role: string }, brandId: string) {
  if (user.role === "ADMIN") return true;
  const [brand, access] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { userId: true, isActive: true } }),
    prisma.userBrand.findUnique({ where: { userId_brandId: { userId: user.id, brandId } } }),
  ]);
  return !!brand?.isActive && (brand.userId === user.id || !!access);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const trackingNumbers = (Array.isArray(body.trackingNumbers)
    ? [...new Set(body.trackingNumbers.map(String).map((value: string) => value.trim()).filter((value: string) => /^[A-Za-z0-9-]{3,40}$/.test(value)))].slice(0, 200)
    : []) as string[];
  if (!trackingNumbers.length) return NextResponse.json({ error: "No valid tracking numbers" }, { status: 400 });
  const orders = await prisma.order.findMany({ where: { trackingNumber: { in: trackingNumbers }, courier: "M&P" }, select: { trackingNumber: true, brandId: true } });
  if (!orders.length) return NextResponse.json({ error: "M&P orders not found" }, { status: 404 });
  const brandIds = [...new Set(orders.map((order) => order.brandId))];
  if (brandIds.length !== 1) return NextResponse.json({ error: "Bulk M&P tracking must use one brand at a time" }, { status: 400 });
  if (!(await canAccessBrand(user, brandIds[0]))) return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  const config = await getMnpBrandConfig(brandIds[0]);
  if (!config?.enabled) return NextResponse.json({ error: "M&P is unavailable for this brand" }, { status: 403 });
  try {
    const raw = await trackMnpBulk(orders.map((order) => order.trackingNumber), config.credentials);
    const rows = mnpRows(raw);
    const statuses = await Promise.all(orders.map(async (order) => {
      const row = rows.find((item) => String(item.ConsignmentNumber || item.consignmentNumber || "").trim() === order.trackingNumber);
      return saveMnpTrackingResult(order.trackingNumber, row || raw);
    }));
    return NextResponse.json(statuses);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to track M&P consignments" }, { status: 502 });
  }
}