import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { userCanAccessBrand } from "@/lib/brandAccess";
import { prisma } from "@/lib/prisma";

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()));
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const brandId = params.get("brandId")?.trim() || "";
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  if (!brandId || !validDate(startDate) || !validDate(endDate) || startDate! > endDate!) {
    return NextResponse.json({ error: "A brand and valid date range are required" }, { status: 400 });
  }
  if (!(await userCanAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }

  const dist = await prisma.order.findMany({
    where: {
      brandId,
      courier: "TRAX",
      orderDate: { gte: `${startDate}T00:00:00.000Z`, lte: `${endDate}T23:59:59.999Z` },
    },
    include: { trackingStatus: true, paymentStatus: true },
    orderBy: { orderDate: "desc" },
  });
  return NextResponse.json({ dist, source: "local", count: dist.length });
}