import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest, hashPassword } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { username, password, displayName, role, isActive, brandIds } = await req.json();

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (existing.role === "SUPER_ADMIN" && existing.id === session.user.id) {
      if (role && role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Cannot demote yourself" }, { status: 400 });
      }
      if (isActive === false) {
        return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
      }
    }

    const updateData: any = {};
    if (username && username !== existing.username) {
      const taken = await prisma.user.findUnique({ where: { username } });
      if (taken) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
      updateData.username = username;
    }
    if (password) {
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      updateData.passwordHash = await hashPassword(password);
    }
    if (displayName !== undefined) updateData.displayName = displayName;
    if (role) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    await prisma.user.update({ where: { id }, data: updateData });

    if (Array.isArray(brandIds)) {
      await prisma.userBrand.deleteMany({ where: { userId: id } });
      if (brandIds.length > 0) {
        await prisma.userBrand.createMany({
          data: brandIds.map((brandId: string) => ({
            userId: id,
            brandId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const updated = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        userBrands: {
          select: {
            brandId: true,
            brand: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update user:", error.message);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    if (id === session.user.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete user:", error.message);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
