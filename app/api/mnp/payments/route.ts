import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMnpBrandConfig, getMnpLocationId, getMnpPaymentReports, mnpRows, normalizeMnpPayment, saveMnpPaymentStatus } from "@/lib/mnp";

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
  const startDate = params.get("startDate")?.trim();
  const endDate = params.get("endDate")?.trim();
  const force = params.get("force") === "true";
  if (!brandId || !startDate || !endDate) return NextResponse.json({ error: "Brand and date range are required" }, { status: 400 });
  if (!(await canAccessBrand(user, brandId))) return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  const where = { brandId, courier: "M&P", orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` } };
  try {
    const config = await getMnpBrandConfig(brandId);
    if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    if (force) {
      if (!config.enabled) return NextResponse.json({ error: "M&P is disabled for this brand" }, { status: 403 });
      const locationID = params.get("locationID")?.trim() || await getMnpLocationId(config.credentials);
      const reports = await getMnpPaymentReports(startDate, endDate, locationID, config.credentials);
      const payments = reports.flatMap((raw) => mnpRows(raw).map((row) => normalizeMnpPayment(row)));
      let persisted = 0;
      for (const payment of payments) {
        if (await saveMnpPaymentStatus(payment)) persisted += 1;
      }
      return NextResponse.json({
        payments,
        source: "live",
        count: payments.length,
        persisted,
        emptyReason: payments.length === 0
          ? "M&P returned no payment report records for the selected month and location."
          : null,
      });
    }
    const orders = await prisma.order.findMany({ where, select: { trackingNumber: true } });
    const saved = orders.length ? await prisma.paymentStatus.findMany({ where: { trackingNumber: { in: orders.map((order) => order.trackingNumber) } } }) : [];
    const payments = saved.flatMap((item) => {
      try { return [JSON.parse(item.data)]; } catch { return []; }
    });
    return NextResponse.json({ payments, source: "local", count: payments.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "M&P payment sync failed" }, { status: 502 });
  }
}