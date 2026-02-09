import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const SESSION_COOKIE = "hub_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const sessionStore = new Map<string, { userId: string; expiresAt: number }>();

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createSession(userId: string): string {
  const sessionId = crypto.randomBytes(32).toString("hex");
  sessionStore.set(sessionId, {
    userId,
    expiresAt: Date.now() + SESSION_MAX_AGE * 1000,
  });
  return sessionId;
}

export function deleteSession(sessionId: string): void {
  sessionStore.delete(sessionId);
}

export function getSessionUserId(sessionId: string): string | null {
  const session = sessionStore.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessionStore.delete(sessionId);
    return null;
  }
  return session.userId;
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!sessionId) return null;

    const userId = getSessionUserId(sessionId);
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    return user;
  } catch {
    return null;
  }
}

export async function getUserBrandIds(userId: string, role: string): Promise<string[] | "all"> {
  if (role === "admin") return "all";
  const userBrands = await prisma.userBrand.findMany({
    where: { userId },
    select: { brandId: true },
  });
  return userBrands.map((ub) => ub.brandId);
}

export { SESSION_COOKIE, SESSION_MAX_AGE };
