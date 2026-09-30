import { createHmac } from "node:crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

function signingKey(): string {
  const dedicatedKey = process.env.JWT_SECRET;
  if (dedicatedKey) {
    if (dedicatedKey.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
    return dedicatedKey;
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("Configure a JWT_SECRET or SESSION_SECRET with at least 32 characters");
  }
  return createHmac("sha256", sessionSecret)
    .update("hublogistic-auth-jwt-v1")
    .digest("hex");
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "USER";
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    signingKey(),
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): AuthUser | null {
  const key = signingKey();
  try {
    const decoded = jwt.verify(token, key) as AuthUser;
    return decoded;
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  const user = verifyToken(token);
  if (!user) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.isActive) return null;
  return { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role };
}
