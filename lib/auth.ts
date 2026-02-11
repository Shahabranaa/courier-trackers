import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "hub_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { token, userId, expiresAt },
  });

  return token;
}

export async function getSessionFromRequest(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          userBrands: { select: { brandId: true } },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  if (!session.user.isActive) return null;

  return session;
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          userBrands: { select: { brandId: true } },
        },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    }
    return null;
  }

  if (!session.user.isActive) return null;

  return session;
}

export async function deleteSession(token: string) {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

export async function seedSuperAdmin() {
  const existing = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
  });

  if (!existing) {
    const passwordHash = await hashPassword("admin123");
    try {
      await prisma.user.create({
        data: {
          username: "admin",
          passwordHash,
          displayName: "Super Admin",
          role: "SUPER_ADMIN",
        },
      });
      console.log("Super admin created: username=admin, password=admin123");
    } catch (e: any) {
      if (e?.code !== "P2002") throw e;
    }
  }
}

export function canAccessBrand(
  user: { role: string; userBrands: { brandId: string }[] },
  brandId: string
): boolean {
  if (user.role === "SUPER_ADMIN") return true;
  return user.userBrands.some((ub) => ub.brandId === brandId);
}

export async function requireAuthAndBrand(req: NextRequest): Promise<
  { session: any; brandId: string } | NextResponse
> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const brandId = req.headers.get("brand-id") || "";
  if (brandId && !canAccessBrand(session.user, brandId)) {
    return NextResponse.json({ error: "Access denied to this brand" }, { status: 403 });
  }

  return { session, brandId };
}

export async function cleanExpiredSessions() {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

export { SESSION_COOKIE };
