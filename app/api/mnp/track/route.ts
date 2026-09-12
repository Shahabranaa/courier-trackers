import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMnpBrandConfig, saveMnpTrackingResult, trackMnpConsignment } from "@/lib/mnp";

async function canAccessBrand(user: { id: string; role: string }, brandId: string) {
  if (user.role === "ADMIN") return true;
  const [brand, access] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { userId: true, isActive: true } }),
    prisma.userBrand.findUnique({ where: { userId_brandId: { userId: user.id, brandId } } }),
  ]);
  return !!brand?.isActive && (brand.userId === user.id || !!access);
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trackingNumber = new URL(req.url).searchParams.get("trackingNumber")?.trim();
  if (!trackingNumber || !/^[A-Za-z0-9-]{3,40}$/.test(trackingNumber)) return NextResponse.json({ error: "Invalid tracking number" }, { status: 400 });
  const order = await prisma.order.findFirst({ where: { trackingNumber, courier: "M&P" }, select: { brandId: true } });
  if (!order) return NextResponse.json({ error: "M&P order not found" }, { status: 404 });
  if (!(await canAccessBrand(user, order.brandId))) return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  try {
    const config = await getMnpBrandConfig(order.brandId);
    if (!config?.enabled) return NextResponse.json({ error: "M&P is unavailable for this brand" }, { status: 403 });
    return NextResponse.json(await saveMnpTrackingResult(trackingNumber, await trackMnpConsignment(trackingNumber)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to track M&P consignment" }, { status: 502 });
  }
}