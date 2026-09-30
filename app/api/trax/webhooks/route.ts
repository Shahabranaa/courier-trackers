import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { userCanAccessBrand } from "@/lib/brandAccess";
import { prisma } from "@/lib/prisma";
import {
  createTraxWebhookToken,
  TRAX_WEBHOOK_KINDS,
} from "@/lib/trax-webhook-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = new URL(req.url).searchParams.get("brandId")?.trim() || "";
  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  if (!(await userCanAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }
  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  try {
    const subscriptions = Object.fromEntries(TRAX_WEBHOOK_KINDS.map((kind) => [
      kind,
      `/api/trax/webhooks/${brandId}/${kind}/${createTraxWebhookToken(brandId, kind)}`,
    ]));
    return NextResponse.json({ brandId, subscriptions });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "TRAX webhook URLs are not configured",
    }, { status: 500 });
  }
}