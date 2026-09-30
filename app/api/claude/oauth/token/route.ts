import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { claudeResource, hashClaudeSecret, createClaudeSecret, oauthError } from "@/lib/claudeOauth";
import { prisma } from "@/lib/prisma";

const ACCESS_LIFETIME_SECONDS = 60 * 60;
const REFRESH_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

function tokenResponse(accessToken: string, refreshToken: string, scope: string) {
  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_LIFETIME_SECONDS,
    refresh_token: refreshToken,
    scope,
  }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}

export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get("content-type")?.toLowerCase().includes("application/x-www-form-urlencoded")) {
      return oauthError("invalid_request");
    }
    const form = await req.formData();
    const grantType = String(form.get("grant_type") || "");
    const clientId = String(form.get("client_id") || "");
    if (!clientId) return oauthError("invalid_client", 401);
    const client = await prisma.claudeOAuthClient.findUnique({ where: { clientId } });
    if (!client) return oauthError("invalid_client", 401);

    if (grantType === "authorization_code") {
      const code = String(form.get("code") || "");
      const redirectUri = String(form.get("redirect_uri") || "");
      const verifier = String(form.get("code_verifier") || "");
      const resource = String(form.get("resource") || "");
      if (
        !code ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
        redirectUri !== client.redirectUri ||
        resource !== claudeResource(req)
      ) {
        return oauthError("invalid_grant");
      }
      const codeHash = hashClaudeSecret(code);
      const stored = await prisma.claudeOAuthAuthorizationCode.findUnique({ where: { codeHash } });
      const computedChallenge = createHash("sha256").update(verifier).digest("base64url");
      if (
        !stored ||
        stored.clientId !== clientId ||
        stored.redirectUri !== redirectUri ||
        stored.resource !== resource ||
        stored.expiresAt <= new Date() ||
        stored.scope !== "orders:read" ||
        computedChallenge !== stored.codeChallenge
      ) return oauthError("invalid_grant");

      const user = await prisma.user.findUnique({ where: { id: stored.userId }, select: { id: true, isActive: true } });
      if (!user?.isActive) return oauthError("invalid_grant");

      const accessToken = createClaudeSecret();
      const refreshToken = createClaudeSecret();
      const familyId = createClaudeSecret();
      const now = new Date();
      const consumed = await prisma.$transaction(async (tx) => {
        const result = await tx.claudeOAuthAuthorizationCode.updateMany({
          where: { codeHash, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (result.count !== 1) return false;
        await tx.claudeOAuthTokenFamily.create({ data: { familyId } });
        await tx.claudeOAuthAccessToken.create({
          data: {
            tokenHash: hashClaudeSecret(accessToken),
            familyId,
            clientId,
            userId: user.id,
            scope: stored.scope,
            resource: stored.resource,
            expiresAt: new Date(now.getTime() + ACCESS_LIFETIME_SECONDS * 1000),
          },
        });
        await tx.claudeOAuthRefreshToken.create({
          data: {
            tokenHash: hashClaudeSecret(refreshToken),
            familyId,
            clientId,
            userId: user.id,
            scope: stored.scope,
            resource: stored.resource,
            expiresAt: new Date(now.getTime() + REFRESH_LIFETIME_SECONDS * 1000),
          },
        });
        return true;
      });
      return consumed ? tokenResponse(accessToken, refreshToken, stored.scope) : oauthError("invalid_grant");
    }

    if (grantType === "refresh_token") {
      const rawToken = String(form.get("refresh_token") || "");
      const resource = String(form.get("resource") || "");
      if (!rawToken || resource !== claudeResource(req)) return oauthError("invalid_grant");
      const tokenHash = hashClaudeSecret(rawToken);
      const stored = await prisma.claudeOAuthRefreshToken.findUnique({ where: { tokenHash } });
      if (!stored || stored.clientId !== clientId || stored.expiresAt <= new Date() || stored.revokedAt) {
        return oauthError("invalid_grant");
      }
      const user = await prisma.user.findUnique({ where: { id: stored.userId }, select: { id: true, isActive: true } });
      if (
        !user?.isActive ||
        stored.scope !== "orders:read" ||
        stored.resource !== resource
      ) return oauthError("invalid_grant");

      const accessToken = createClaudeSecret();
      const refreshToken = createClaudeSecret();
      const now = new Date();
      const rotated = await prisma.$transaction(async (tx) => {
        // All refresh/revoke operations for a token family lock this same row.
        // If refresh wins, a later revoke marks its newly issued tokens revoked;
        // if revoke wins, this check prevents issuing a successor at all.
        const families = await tx.$queryRaw<Array<{ familyId: string; revokedAt: Date | null }>>`
          SELECT "familyId", "revokedAt"
          FROM "ClaudeOAuthTokenFamily"
          WHERE "familyId" = ${stored.familyId}
          FOR UPDATE
        `;
        if (!families[0] || families[0].revokedAt) return false;
        const result = await tx.claudeOAuthRefreshToken.updateMany({
          where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
          data: { revokedAt: now },
        });
        if (result.count !== 1) return false;
        await tx.claudeOAuthAccessToken.create({
          data: {
            tokenHash: hashClaudeSecret(accessToken),
            familyId: stored.familyId,
            clientId,
            userId: user.id,
            scope: stored.scope,
            resource: stored.resource,
            expiresAt: new Date(now.getTime() + ACCESS_LIFETIME_SECONDS * 1000),
          },
        });
        await tx.claudeOAuthRefreshToken.create({
          data: {
            tokenHash: hashClaudeSecret(refreshToken),
            familyId: stored.familyId,
            clientId,
            userId: user.id,
            scope: stored.scope,
            resource: stored.resource,
            expiresAt: new Date(now.getTime() + REFRESH_LIFETIME_SECONDS * 1000),
          },
        });
        return true;
      });
      return rotated ? tokenResponse(accessToken, refreshToken, stored.scope) : oauthError("invalid_grant");
    }

    return oauthError("unsupported_grant_type");
  } catch {
    return oauthError("invalid_request");
  }
}