import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeopardsBrandConfig, saveLeopardsTrackingResult, trackBookedPacket } from "@/lib/leopardsMerchant";

export async function POST(req: NextRequest) {
  if (!await getAuthUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const trackingNumbers = Array.isArray(body.trackingNumbers) ? body.trackingNumbers.map(String).filter((value: string) => /^[A-Za-z0-9-]{3,40}$/.test(value)).slice(0, 500) : [];
  if (!trackingNumbers.length) return NextResponse.json({ error: "No valid tracking numbers" }, { status: 400 });
  const orders = await prisma.order.findMany({ where: { trackingNumber: { in: trackingNumbers }, courier: "Leopards" }, select: { trackingNumber: true, brandId: true } });
  const byTracking = new Map(orders.map((order) => [order.trackingNumber, order.brandId]));
  const configs = new Map<string, Awaited<ReturnType<typeof getLeopardsBrandConfig>>>();
  for (const brandId of new Set(orders.map((order) => order.brandId))) configs.set(brandId, await getLeopardsBrandConfig(brandId));
  const statuses: unknown[] = [];
  for (let i = 0; i < trackingNumbers.length; i += 10) {
    const results = await Promise.allSettled(trackingNumbers.slice(i, i + 10).map(async (trackingNumber: string) => {
      const config = configs.get(byTracking.get(trackingNumber) || "");
      if (!config || !config.enabled) throw new Error("Leopards is unavailable for this brand");
      return saveLeopardsTrackingResult(trackingNumber, await trackBookedPacket(trackingNumber, config.credentials));
    }));
    results.forEach((result) => { if (result.status === "fulfilled") statuses.push(result.value); });
  }
  return NextResponse.json(statuses);
}