import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  return NextResponse.json({ needsSetup: adminCount === 0 });
}

export async function POST(req: NextRequest) {
  try {
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount > 0) {
      return NextResponse.json({ error: "Admin already exists. Use the admin panel to manage users." }, { status: 403 });
    }

    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const admin = await prisma.user.create({
      data: {
        username: username.trim().toLowerCase(),
        passwordHash,
        role: "admin",
      },
    });

    const brands = await prisma.brand.findMany({ select: { id: true } });
    if (brands.length > 0) {
      await prisma.userBrand.createMany({
        data: brands.map((b) => ({ userId: admin.id, brandId: b.id })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      message: "Admin account created successfully",
      user: { id: admin.id, username: admin.username, role: admin.role },
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }
    console.error("Setup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
