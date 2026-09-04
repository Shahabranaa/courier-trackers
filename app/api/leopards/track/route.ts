import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLeopardsBrandConfig, saveLeopardsTrackingResult, trackBookedPacket } from "@/lib/leopardsMerchant";

export async function GET(req: NextRequest) {
  if (!await getAuthUser()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trackingNumber = new URL(req.url).searchParams.get("trackingNumber")?.trim();
  if (!trackingNumber || !/^[A-Za-z0-9-]{3,40}$/.test(trackingNumber)) return NextResponse.json({ error: "Invalid tracking number" }, { status: 400 });
  try {
    const order = await prisma.order.findFirst({ where: { trackingNumber, courier: "Leopards" }, select: { brandId: true } });
    if (!order) return NextResponse.json({ error: "Leopards order not found" }, { status: 404 });
    const config = await getLeopardsBrandConfig(order.brandId);
    if (!config || !config.enabled) return NextResponse.json({ error: "Leopards is unavailable for this brand" }, { status: 403 });
    return NextResponse.json(await saveLeopardsTrackingResult(trackingNumber, await trackBookedPacket(trackingNumber, config.credentials)));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to track Leopards consignment" }, { status: 502 }); }
}