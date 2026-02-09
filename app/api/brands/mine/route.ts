import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let brands;
    if (user.role === "admin") {
      brands = await prisma.brand.findMany({
        orderBy: { createdAt: "asc" },
      });
    } else {
      const userBrands = await prisma.userBrand.findMany({
        where: { userId: user.id },
        include: {
          brand: true,
        },
        orderBy: { brand: { createdAt: "asc" } },
      });
      brands = userBrands.map((ub) => ub.brand);
    }

    const safeBrands = brands.map((b) => ({
      ...b,
      shopifyAccessToken: b.shopifyAccessToken ? "••••••••" : "",
      shopifyClientSecret: b.shopifyClientSecret ? "••••••••" : "",
    }));

    return NextResponse.json(safeBrands);
  } catch (error: any) {
    console.error("Failed to fetch user brands:", error.message);
    return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
  }
}
