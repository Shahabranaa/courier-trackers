import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getTcsBrandConfig, getTcsEcomAccessToken } from "@/lib/tcs";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const brandId = new URL(req.url).searchParams.get("brandId")?.trim();
    const brandConfig = brandId ? await getTcsBrandConfig(brandId) : null;
    await getTcsEcomAccessToken(false, brandConfig?.credentials);
    return NextResponse.json({ connected: true, environment: "development" });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      environment: "development",
      error: error instanceof Error ? error.message : "TCS connection failed",
    }, { status: 502 });
  }
}