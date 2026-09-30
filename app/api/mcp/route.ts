import { NextRequest, NextResponse } from "next/server";
import { callClaudeTool, claudeTools } from "@/lib/claudeMcp";
import { claudeUnauthorized, getClaudePrincipal } from "@/lib/claudeOauth";

export const dynamic = "force-dynamic";

type RpcRequest = { jsonrpc: "2.0"; id?: string | number; method: string; params?: unknown };
const MAX_REQUEST_BYTES = 32 * 1024;
const PROTOCOL_VERSION = "2025-06-18";

function rpc(id: string | number | null, result: unknown, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { status, headers: { "Cache-Control": "no-store", "MCP-Protocol-Version": PROTOCOL_VERSION } });
}

function rpcError(id: string | number | null, code: number, message: string, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status, headers: { "Cache-Control": "no-store", "MCP-Protocol-Version": PROTOCOL_VERSION } });
}

export async function POST(req: NextRequest) {
  const principal = await getClaudePrincipal(req);
  if (!principal) return claudeUnauthorized(req);

  const advertisedVersion = req.headers.get("mcp-protocol-version");
  if (advertisedVersion && advertisedVersion !== PROTOCOL_VERSION) {
    return rpcError(null, -32600, `Unsupported MCP protocol version: ${advertisedVersion}`, 400);
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return rpcError(null, -32600, "Expected application/json", 415);
  }
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_REQUEST_BYTES) return rpcError(null, -32600, "Request too large", 413);
  const body = await req.text();
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) return rpcError(null, -32600, "Request too large", 413);
  let value: unknown;
  try { value = JSON.parse(body); } catch { return rpcError(null, -32700, "Parse error", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return rpcError(null, -32600, "Invalid request", 400);
  const request = value as Partial<RpcRequest>;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string" ||
      (request.id !== undefined && typeof request.id !== "number" && typeof request.id !== "string")) {
    return rpcError(null, -32600, "Invalid request", 400);
  }
  if (request.id === undefined && request.method.startsWith("notifications/")) return new NextResponse(null, { status: 202 });
  if (request.id === undefined) return rpcError(null, -32600, "Request ID required", 400);
  const id = request.id;

  switch (request.method) {
    case "initialize": {
      const params = request.params;
      if (!params || typeof params !== "object" || Array.isArray(params) ||
          typeof (params as { protocolVersion?: unknown }).protocolVersion !== "string") {
        return rpcError(id, -32602, "Missing protocolVersion");
      }
      // MCP negotiation permits the server to reply with a version it supports.
      // The client decides whether it can continue with this version.
      return rpc(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "hublogistic", version: "1.0.0" },
        instructions: "Read-only access to locally saved order, tracking, and payment summaries. Data may be stale until manually synced in HubLogistic. Always obtain an accessible brand ID first. Do not treat amounts or statuses as verified live courier data.",
      });
    }
    case "ping":
      return rpc(id, {});
    case "tools/list":
      return rpc(id, { tools: claudeTools });
    case "tools/call": {
      const params = request.params;
      if (!params || typeof params !== "object" || Array.isArray(params)) return rpcError(id, -32602, "Invalid tool parameters");
      const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
      if (typeof name !== "string" || !claudeTools.some((tool) => tool.name === name) ||
          (args !== undefined && (!args || typeof args !== "object" || Array.isArray(args)))) {
        return rpcError(id, -32602, "Invalid tool name or arguments");
      }
      try {
        const result = await callClaudeTool(principal.userId, name, (args || {}) as Record<string, unknown>);
        return rpc(id, { content: [{ type: "text", text: JSON.stringify(result) }] });
      } catch (error) {
        // Validation and permission failures are tool errors; unexpected DB errors are not exposed.
        const message = error instanceof Error && /^(Brand access denied|Account inactive|Unknown tool|.* is required|Provide a valid|limit must be)/.test(error.message)
          ? error.message : "Unable to read the requested data";
        return rpc(id, { isError: true, content: [{ type: "text", text: message }] });
      }
    }
    default:
      return rpcError(id, -32601, "Method not found");
  }
}

export async function GET(req: NextRequest) {
  const principal = await getClaudePrincipal(req);
  if (!principal) return claudeUnauthorized(req);
  return new NextResponse(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}

export async function DELETE(req: NextRequest) {
  const principal = await getClaudePrincipal(req);
  if (!principal) return claudeUnauthorized(req);
  return new NextResponse(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}