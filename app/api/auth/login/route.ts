import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSession, seedSuperAdmin, SESSION_COOKIE } from "@/lib/auth";

let seeded = false;

export async function POST(req: NextRequest) {
  try {
    if (!seeded) {
      await seedSuperAdmin();
      seeded = true;
    }

    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const token = await createSession(user.id);

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });

    const isProduction = process.env.NODE_ENV === "production";
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error.message);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
