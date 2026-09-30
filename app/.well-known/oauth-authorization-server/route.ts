import { NextRequest, NextResponse } from "next/server";
import { getClaudeOrigin } from "@/lib/claudeOauth";

export async function GET(req: NextRequest) {
  try {
    const issuer = getClaudeOrigin(req);
    return NextResponse.json({
      issuer,
      authorization_endpoint: `${issuer}/api/claude/oauth/authorize`,
      token_endpoint: `${issuer}/api/claude/oauth/token`,
      registration_endpoint: `${issuer}/api/claude/oauth/register`,
      revocation_endpoint: `${issuer}/api/claude/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["orders:read"],
      response_modes_supported: ["query"],
    }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "OAuth issuer is not configured" }, { status: 503 });
  }
}