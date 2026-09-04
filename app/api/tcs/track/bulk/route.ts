import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTcsBrandConfig, saveTcsTrackingResult, trackTcsConsignment } from "@/lib/tcs";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const trackingNumbers = Array.isArray(body.trackingNumbers)
    ? body.trackingNumbers.map(String).filter((value: string) => /^[A-Za-z0-9-]{3,40}$/.test(value)).slice(0, 500)
    : [];
  if (!trackingNumbers.length) return NextResponse.json({ error: "No valid tracking numbers" }, { status: 400 });

  const orders = await prisma.order.findMany({
    where: { trackingNumber: { in: trackingNumbers }, courier: "TCS" },
    select: { trackingNumber: true, brandId: true },
  });
  const brandByTracking = new Map(orders.map((order) => [order.trackingNumber, order.brandId]));
  const configByBrand = new Map<string, Awaited<ReturnType<typeof getTcsBrandConfig>>>();
  for (const brandId of new Set(orders.map((order) => order.brandId))) {
    configByBrand.set(brandId, await getTcsBrandConfig(brandId));
  }

  const statuses: unknown[] = [];
  for (let i = 0; i < trackingNumbers.length; i += 10) {
    const batch = trackingNumbers.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map(async (trackingNumber: string) => {
      const brandId = brandByTracking.get(trackingNumber);
      const credentials = brandId ? configByBrand.get(brandId)?.credentials : undefined;
      const raw = await trackTcsConsignment(trackingNumber, credentials);
      return saveTcsTrackingResult(trackingNumber, raw, credentials);
    }));
    results.forEach((result) => { if (result.status === "fulfilled") statuses.push(result.value); });
  }
  return NextResponse.json(statuses);
}