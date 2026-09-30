import { NextRequest, NextResponse } from "next/server";
import { CLAUDE_CALLBACK_URI, createClaudeSecret, oauthError } from "@/lib/claudeOauth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return oauthError("invalid_client_metadata");
    }
    body = await req.json();
  } catch {
    return oauthError("invalid_client_metadata");
  }
  if (
    !body ||
    !Array.isArray(body.redirect_uris) ||
    body.redirect_uris.length !== 1 ||
    body.redirect_uris[0] !== CLAUDE_CALLBACK_URI ||
    (body.scope && body.scope !== "orders:read") ||
    (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") ||
    (body.grant_types && (!Array.isArray(body.grant_types) || !body.grant_types.includes("authorization_code") || body.grant_types.some((grant: string) => grant !== "authorization_code" && grant !== "refresh_token"))) ||
    (body.response_types && (!Array.isArray(body.response_types) || !body.response_types.includes("code") || body.response_types.some((type: string) => type !== "code")))
  ) return oauthError("invalid_client_metadata");
  try {
    const clientId = createClaudeSecret();
    await prisma.claudeOAuthClient.create({ data: { clientId, redirectUri: CLAUDE_CALLBACK_URI } });
    return NextResponse.json({
      client_id: clientId,
      redirect_uris: [CLAUDE_CALLBACK_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "orders:read",
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Claude OAuth registration failed:", error);
    return oauthError("server_error", 500);
  }
}