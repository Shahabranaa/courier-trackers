import { NextRequest, NextResponse } from "next/server";
import { claudeResource, getClaudeOrigin } from "@/lib/claudeOauth";

export async function GET(req: NextRequest) {
  try {
    const issuer = getClaudeOrigin(req);
    return NextResponse.json({
      resource: claudeResource(req),
      authorization_servers: [issuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["orders:read"],
      resource_name: "HubLogistic order data",
    }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "OAuth issuer is not configured" }, { status: 503 });
  }
}