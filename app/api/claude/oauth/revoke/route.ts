import { NextRequest, NextResponse } from "next/server";
import { hashClaudeSecret } from "@/lib/claudeOauth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const success = new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
  });
  try {
    if (!req.headers.get("content-type")?.toLowerCase().includes("application/x-www-form-urlencoded")) return success;
    const form = await req.formData();
    const rawToken = String(form.get("token") || "");
    const clientId = String(form.get("client_id") || "");
    if (!rawToken || !clientId) return success;
    const tokenHash = hashClaudeSecret(rawToken);
    const [access, refresh] = await Promise.all([
      prisma.claudeOAuthAccessToken.findUnique({ where: { tokenHash }, select: { familyId: true, clientId: true } }),
      prisma.claudeOAuthRefreshToken.findUnique({ where: { tokenHash }, select: { familyId: true, clientId: true } }),
    ]);
    const match = access || refresh;
    if (!match || match.clientId !== clientId) return success;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Match the refresh endpoint's family-row lock so revocation and rotation
      // are ordered. Refresh either observes this flag or has its successor
      // revoked by the transaction below before this endpoint completes.
      const families = await tx.$queryRaw<Array<{ familyId: string; revokedAt: Date | null }>>`
        SELECT "familyId", "revokedAt"
        FROM "ClaudeOAuthTokenFamily"
        WHERE "familyId" = ${match.familyId}
        FOR UPDATE
      `;
      if (!families[0]) return;
      await tx.claudeOAuthTokenFamily.update({
        where: { familyId: match.familyId },
        data: { revokedAt: families[0].revokedAt || now },
      });
      await tx.claudeOAuthAccessToken.updateMany({
        where: { familyId: match.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.claudeOAuthRefreshToken.updateMany({
        where: { familyId: match.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  } catch {
    // RFC 7009 intentionally gives the same response for valid and unknown tokens.
  }
  return success;
}