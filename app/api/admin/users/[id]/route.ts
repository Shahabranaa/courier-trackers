import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { username, password, role, brandIds } = await req.json();

    const updateData: any = {};
    if (username) updateData.username = username.trim().toLowerCase();
    if (password && password.length >= 6) updateData.passwordHash = await hashPassword(password);
    if (role) updateData.role = role === "admin" ? "admin" : "user";

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    if (brandIds !== undefined) {
      await prisma.userBrand.deleteMany({ where: { userId: id } });
      if (brandIds.length > 0) {
        await prisma.userBrand.createMany({
          data: brandIds.map((brandId: string) => ({ userId: id, brandId })),
          skipDuplicates: true,
        });
      }
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;

  if (id === currentUser.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
