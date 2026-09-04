import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (userId) {
    const assignments = await prisma.userBrand.findMany({
      where: { userId },
      include: { brand: { select: { id: true, name: true } } }
    });
    return NextResponse.json(assignments.map(a => ({ id: a.id, brandId: a.brand.id, brandName: a.brand.name })));
  }

  const allBrands = await prisma.brand.findMany({
    select: { id: true, name: true, userId: true },
    orderBy: { name: "asc" }
  });
  return NextResponse.json(allBrands);
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { userId, brandId } = await req.json();
    if (!userId || !brandId) {
      return NextResponse.json({ error: "userId and brandId are required" }, { status: 400 });
    }

    const existing = await prisma.userBrand.findUnique({
      where: { userId_brandId: { userId, brandId } }
    });
    if (existing) {
      return NextResponse.json({ error: "Brand is already assigned to this user" }, { status: 409 });
    }

    const assignment = await prisma.userBrand.create({
      data: { userId, brandId },
      include: { brand: { select: { id: true, name: true } } }
    });

    return NextResponse.json({ id: assignment.id, brandId: assignment.brand.id, brandName: assignment.brand.name }, { status: 201 });
  } catch (error: any) {
    console.error("Assign brand error:", error.message);
    return NextResponse.json({ error: "Failed to assign brand" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser || authUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const brandId = searchParams.get("brandId");

  if (!userId || !brandId) {
    return NextResponse.json({ error: "userId and brandId are required" }, { status: 400 });
  }

  try {
    await prisma.userBrand.delete({
      where: { userId_brandId: { userId, brandId } }
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Unassign brand error:", error.message);
    return NextResponse.json({ error: "Failed to unassign brand" }, { status: 500 });
  }
}
