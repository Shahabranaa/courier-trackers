import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const CLAUDE_SCOPE = "orders:read";
export const CLAUDE_RESOURCE_PATH = "/api/mcp";
// Explicit deployment origin, never derived from untrusted request headers.
export const CLAUDE_PRODUCTION_ORIGIN = "https://courier-trackers.vercel.app";
// Claude.ai and remote Claude Desktop connectors use the same hosted OAuth callback.
export const CLAUDE_CALLBACK_URI = "https://claude.ai/api/mcp/auth_callback";

export interface ClaudePrincipal {
  userId: string;
}

export interface ClaudeAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string;
  scope: string;
}

/**
 * Production defaults to the app's explicitly configured Vercel origin.
 * CLAUDE_OAUTH_ISSUER can override it when moving to another public HTTPS origin
 * (no path or trailing slash). Never infer it from Host/forwarded headers.
 */
export function getClaudeOrigin(req: NextRequest): string {
  const configured = process.env.CLAUDE_OAUTH_ISSUER ||
    (process.env.NODE_ENV === "production" ? CLAUDE_PRODUCTION_ORIGIN : undefined);
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error("CLAUDE_OAUTH_ISSUER must be a valid origin");
    }
    if (
      url.origin !== configured.replace(/\/$/, "") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    ) {
      throw new Error("CLAUDE_OAUTH_ISSUER must be a canonical origin (HTTPS in production)");
    }
    return url.origin;
  }

  // In development, only accept a directly addressed local proxy. Do not derive
  // an issuer from arbitrary forwarded headers or a public request Host.
  const url = req.nextUrl;
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error("Set CLAUDE_OAUTH_ISSUER when using a non-local development proxy");
  }
  return url.origin;
}

export function claudeResource(req: NextRequest): string {
  return `${getClaudeOrigin(req)}${CLAUDE_RESOURCE_PATH}`;
}

export function hashClaudeSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createClaudeSecret(): string {
  return randomBytes(32).toString("base64url");
}

function oauthSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("OAuth consent protection requires JWT_SECRET or SESSION_SECRET (32+ characters)");
  }
  return secret;
}

export function createConsentCsrf(
  sessionToken: string,
  request: ClaudeAuthorizationRequest
): { csrf: string; expires: number } {
  const expires = Math.floor(Date.now() / 1000) + 300;
  return { csrf: consentCsrfForExpiry(sessionToken, request, expires), expires };
}

function consentCsrfForExpiry(
  sessionToken: string,
  request: ClaudeAuthorizationRequest,
  expires: number
): string {
  const payload = [sessionToken, request.clientId, request.redirectUri, request.state, request.codeChallenge, request.resource, request.scope, String(expires)].join("\n");
  return createHmac("sha256", oauthSecret()).update(payload).digest("base64url");
}

export function validConsentCsrf(
  sessionToken: string,
  request: ClaudeAuthorizationRequest,
  expires: number,
  csrf: string
): boolean {
  if (!Number.isSafeInteger(expires) || expires < Date.now() / 1000 || expires > Date.now() / 1000 + 600) return false;
  try {
    const expected = Buffer.from(consentCsrfForExpiry(sessionToken, request, expires));
    const received = Buffer.from(csrf);
    return expected.length === received.length && timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}

export function parseClaudeAuthorizationRequest(
  params: URLSearchParams,
  req?: NextRequest
): ClaudeAuthorizationRequest | null {
  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const state = params.get("state") || "";
  const codeChallenge = params.get("code_challenge") || "";
  const challengeMethod = params.get("code_challenge_method");
  const scope = params.get("scope") || CLAUDE_SCOPE;
  const resource = params.get("resource") || "";
  let validResource = false;
  try {
    const parsedResource = new URL(resource);
    validResource = parsedResource.pathname === CLAUDE_RESOURCE_PATH &&
      parsedResource.origin === resource.slice(0, -CLAUDE_RESOURCE_PATH.length) &&
      !parsedResource.search && !parsedResource.hash &&
      (parsedResource.protocol === "https:" ||
        (parsedResource.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsedResource.hostname)));
  } catch {
    validResource = false;
  }

  if (
    params.get("response_type") !== "code" ||
    !clientId ||
    redirectUri !== CLAUDE_CALLBACK_URI ||
    !state ||
    state.length > 1024 ||
    !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) ||
    challengeMethod !== "S256" ||
    scope !== CLAUDE_SCOPE ||
    !validResource ||
    (req !== undefined && resource !== claudeResource(req))
  ) return null;

  return { clientId, redirectUri, state, codeChallenge, resource, scope };
}

export async function validateRegisteredAuthorization(
  request: ClaudeAuthorizationRequest
): Promise<boolean> {
  const client = await prisma.claudeOAuthClient.findUnique({
    where: { clientId: request.clientId },
    select: { redirectUri: true },
  });
  return client?.redirectUri === request.redirectUri;
}

export async function getClaudePrincipal(req: NextRequest): Promise<ClaudePrincipal | null> {
  const authorization = req.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{40,})$/.exec(authorization);
  if (!match) return null;

  try {
    const token = await prisma.claudeOAuthAccessToken.findUnique({
      where: { tokenHash: hashClaudeSecret(match[1]) },
      select: { userId: true, familyId: true, resource: true, expiresAt: true, revokedAt: true, scope: true },
    });
    if (
      !token ||
      token.revokedAt ||
      token.expiresAt <= new Date() ||
      token.resource !== claudeResource(req) ||
      token.scope !== CLAUDE_SCOPE
    ) return null;

    const [family, user] = await Promise.all([
      prisma.claudeOAuthTokenFamily.findUnique({
        where: { familyId: token.familyId },
        select: { revokedAt: true },
      }),
      prisma.user.findUnique({
        where: { id: token.userId },
        select: { id: true, isActive: true },
      }),
    ]);
    if (!family || family.revokedAt) return null;
    return user?.isActive ? { userId: user.id } : null;
  } catch {
    return null;
  }
}

export function claudeUnauthorized(req: NextRequest): NextResponse {
  let metadata: string;
  try {
    metadata = `${getClaudeOrigin(req)}/.well-known/oauth-protected-resource/api/mcp`;
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const response = NextResponse.json(
    { error: "unauthorized", error_description: "A valid Claude OAuth access token is required." },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
  response.headers.set("WWW-Authenticate", `Bearer resource_metadata="${metadata}"`);
  return response;
}

export function oauthError(error: string, status = 400): NextResponse {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}

export function hasTrustedBrowserOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === getClaudeOrigin(req);
  } catch {
    return false;
  }
}