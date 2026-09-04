import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    const employee = await prisma.employee.findUnique({
      where: { username },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
          },
        },
        brandAccess: {
          include: {
            brand: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!employee || !employee.isActive) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 }
      );
    }

    const extraBrands = employee.brandAccess
      .map((ba) => ba.brand)
      .filter((b) => b && b.id !== employee.brandId);

    const brands = [
      { id: employee.brand.id, name: employee.brand.name },
      ...extraBrands.map((b) => ({ id: b.id, name: b.name })),
    ];

    return NextResponse.json({
      name: employee.name,
      username: employee.username,
      brandId: employee.brandId,
      brandName: employee.brand.name,
      brands,
    });
  } catch (error) {
    console.error("Employee validation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
