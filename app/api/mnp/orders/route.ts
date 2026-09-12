import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMnpBrandConfig, getMnpLocationId, getMnpQsrReport, mnpRows, normalizeMnpOrder } from "@/lib/mnp";

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
  const params = new URL(req.url).searchParams;
  const brandId = params.get("brandId")?.trim();
  const startDate = params.get("startDate")?.trim() || new Date().toISOString().slice(0, 10);
  const endDate = params.get("endDate")?.trim() || startDate;
  const force = params.get("force") === "true";
  if (!brandId || !(await canAccessBrand(user, brandId))) return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  const where = { brandId, courier: "M&P", orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` } };
  if (!force) {
    const dist = await prisma.order.findMany({ where, include: { trackingStatus: true, paymentStatus: true }, orderBy: { orderDate: "desc" } });
    return NextResponse.json({ dist, source: "local", count: dist.length });
  }
  try {
    const config = await getMnpBrandConfig(brandId);
    if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    if (!config.enabled) return NextResponse.json({ error: "M&P is disabled for this brand" }, { status: 403 });
    const first = new Date(`${startDate}T00:00:00.000Z`);
    const last = new Date(`${endDate}T00:00:00.000Z`);
    const locationID = params.get("locationID")?.trim() || await getMnpLocationId(config.credentials);
    const reports: unknown[] = [];
    let requestedMonths = 0;
    let emptyMonths = 0;
    for (let cursor = new Date(first); cursor <= last; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
      requestedMonths += 1;
      const report = await getMnpQsrReport(cursor.getUTCMonth() + 1, cursor.getUTCFullYear(), locationID, config.credentials);
      if (mnpRows(report).length === 0) emptyMonths += 1;
      reports.push(report);
    }
    const incoming = reports.flatMap((raw) => mnpRows(raw))
      .map((row) => normalizeMnpOrder(row, brandId, startDate))
      .filter((order) => order.trackingNumber);
    for (const order of incoming) {
      await prisma.order.upsert({
        where: { trackingNumber: order.trackingNumber },
        update: { ...order, lastFetchedAt: new Date() },
        create: order,
      });
    }
    const dist = await prisma.order.findMany({ where, include: { trackingStatus: true, paymentStatus: true }, orderBy: { orderDate: "desc" } });
    return NextResponse.json({
      dist,
      source: "live",
      count: dist.length,
      syncSummary: { totalFetched: incoming.length, saved: incoming.length, requestedMonths, emptyMonths },
      emptyReason: incoming.length === 0
        ? "M&P returned no QSR records for the selected date range and location."
        : null,
    });
  } catch (error) {
    const dist = await prisma.order.findMany({ where, include: { trackingStatus: true, paymentStatus: true }, orderBy: { orderDate: "desc" } });
    return NextResponse.json({ dist, source: "local_fallback", count: dist.length, error: error instanceof Error ? error.message : "M&P order sync failed" });
  }
}