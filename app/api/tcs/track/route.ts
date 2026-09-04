import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTcsBrandConfig, saveTcsTrackingResult, trackTcsConsignment } from "@/lib/tcs";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trackingNumber = new URL(req.url).searchParams.get("trackingNumber")?.trim();
  if (!trackingNumber) {
    return NextResponse.json({ error: "Missing trackingNumber" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9-]{3,40}$/.test(trackingNumber)) {
    return NextResponse.json({ error: "Invalid tracking number" }, { status: 400 });
  }

  try {
    const order = await prisma.order.findFirst({
      where: { trackingNumber, courier: "TCS" },
      select: { brandId: true },
    });
    const brandConfig = order ? await getTcsBrandConfig(order.brandId) : null;
    const data = await trackTcsConsignment(trackingNumber, brandConfig?.credentials);
    const normalized = await saveTcsTrackingResult(trackingNumber, data, brandConfig?.credentials);
    return NextResponse.json(normalized);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to track TCS consignment",
    }, { status: 502 });
  }
}