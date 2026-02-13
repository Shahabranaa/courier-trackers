import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyToken, hashPassword } from "@/lib/auth";

async function getAdminUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;

  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || payload.role !== "admin") return null;

  return payload;
}

export async function GET() {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      include: { brand: true },
      orderBy: { createdAt: "desc" },
    });

    const sanitized = users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      brandId: u.brandId,
      brand: u.brand
        ? { id: u.brand.id, name: u.brand.name }
        : null,
      createdAt: u.createdAt,
    }));

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("List users error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Username already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const brand = await prisma.brand.create({
      data: { name: username },
    });

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: "user",
        brandId: brand.id,
      },
      include: { brand: true },
    });

    return NextResponse.json(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        brandId: user.brandId,
        brand: user.brand
          ? { id: user.brand.id, name: user.brand.name }
          : null,
        createdAt: user.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
