import { NextRequest, NextResponse } from "next/server";
import { hash, compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";

async function ensureDefaultAdmin() {
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const hashed = await hash("admin123", 10);
    await prisma.user.create({
      data: {
        email: "admin@hublogistic.com",
        passwordHash: hashed,
        name: "Admin",
        role: "ADMIN"
      }
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    await ensureDefaultAdmin();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });

    res.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/"
    });

    return res;
  } catch (error: any) {
    console.error("Login error:", error.message);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
