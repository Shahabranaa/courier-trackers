import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import {
  createClaudeSecret,
  hashClaudeSecret,
  hasTrustedBrowserOrigin,
  oauthError,
  parseClaudeAuthorizationRequest,
  validConsentCsrf,
  validateRegisteredAuthorization,
} from "@/lib/claudeOauth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  if (!hasTrustedBrowserOrigin(req)) return oauthError("invalid_request", 403);
  try {
    const form = await req.formData();
    const query = new URLSearchParams();
    for (const key of ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"]) {
      const value = form.get(key);
      if (typeof value === "string") query.set(key, value);
    }
    const checked = parseClaudeAuthorizationRequest(query, req);
    if (!checked || !(await validateRegisteredAuthorization(checked))) return oauthError("invalid_request");

    const sessionToken = req.cookies.get("auth_token")?.value;
    const sessionUser = sessionToken ? verifyToken(sessionToken) : null;
    if (!sessionToken || !sessionUser) return oauthError("login_required", 401);
    const user = await prisma.user.findUnique({ where: { id: sessionUser.id }, select: { id: true, isActive: true } });
    if (!user?.isActive) return oauthError("login_required", 401);

    const csrf = String(form.get("csrf") || "");
    const expires = Number(form.get("csrf_expires"));
    if (!validConsentCsrf(sessionToken, checked, expires, csrf)) return oauthError("invalid_request", 403);

    const callback = new URL(checked.redirectUri);
    callback.searchParams.set("state", checked.state);
    if (form.get("decision") !== "allow") {
      callback.searchParams.set("error", "access_denied");
      return NextResponse.redirect(callback, { status: 303 });
    }

    const code = createClaudeSecret();
    await prisma.claudeOAuthAuthorizationCode.create({
      data: {
        codeHash: hashClaudeSecret(code),
        clientId: checked.clientId,
        userId: user.id,
        redirectUri: checked.redirectUri,
        scope: checked.scope,
        resource: checked.resource,
        codeChallenge: checked.codeChallenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    callback.searchParams.set("code", code);
    const response = NextResponse.redirect(callback, { status: 303 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return oauthError("invalid_request");
  }
}