import { NextRequest, NextResponse } from "next/server";
import {
  getClaudeOrigin,
  oauthError,
  parseClaudeAuthorizationRequest,
  validateRegisteredAuthorization,
} from "@/lib/claudeOauth";

export async function GET(req: NextRequest) {
  try {
    const authorization = parseClaudeAuthorizationRequest(req.nextUrl.searchParams, req);
    if (!authorization || !(await validateRegisteredAuthorization(authorization))) {
      return oauthError("invalid_request");
    }
    const target = new URL("/claude/connect", getClaudeOrigin(req));
    for (const key of ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"]) {
      const value = req.nextUrl.searchParams.get(key);
      if (value !== null) target.searchParams.set(key, value);
    }
    target.searchParams.set("scope", authorization.scope);
    target.searchParams.set("resource", authorization.resource);
    return NextResponse.redirect(target, { status: 303 });
  } catch {
    return oauthError("server_error", 503);
  }
}