import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
      userBrands: {
        select: {
          brand: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json(
    users.map((u) => ({
      ...u,
      brands: u.userBrands.map((ub) => ub.brand),
      userBrands: undefined,
    }))
  );
}

export async function POST(req: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { username, password, role, brandIds } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const userRole = role === "admin" ? "admin" : "user";

    const user = await prisma.user.create({
      data: {
        username: username.trim().toLowerCase(),
        passwordHash,
        role: userRole,
      },
    });

    if (brandIds && brandIds.length > 0) {
      await prisma.userBrand.createMany({
        data: brandIds.map((brandId: string) => ({ userId: user.id, brandId })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
