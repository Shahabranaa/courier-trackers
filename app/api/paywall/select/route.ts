import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getPackageById } from "@/lib/packages";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { brandId, packageId } = await req.json();

    if (!brandId || !packageId) {
      return NextResponse.json(
        { error: "brandId and packageId are required" },
        { status: 400 }
      );
    }

    const pkg = getPackageById(packageId);
    if (!pkg) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    if (user.role !== "ADMIN") {
      const ownsBrand = brand.userId === user.id;
      const hasAccess = await prisma.userBrand.findUnique({
        where: { userId_brandId: { userId: user.id, brandId } },
      });
      if (!ownsBrand && !hasAccess) {
        return NextResponse.json(
          { error: "You do not have access to this brand" },
          { status: 403 }
        );
      }
    }

    const updated = await prisma.brand.update({
      where: { id: brandId },
      data: {
        selectedPackage: packageId,
        packageRequestedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        selectedPackage: true,
        packageRequestedAt: true,
      },
    });

    return NextResponse.json({ success: true, brand: updated });
  } catch (error: any) {
    console.error("Paywall select error:", error.message);
    return NextResponse.json({ error: "Failed to submit selection" }, { status: 500 });
  }
}
