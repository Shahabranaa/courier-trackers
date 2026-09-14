import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { checkCourierEnabled } from "@/lib/courierAccess";
import { fetchZoomCatalog } from "@/lib/zoom";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brandId = req.headers.get("brand-id");
  if (!brandId) return NextResponse.json({ error: "brand-id header is required" }, { status: 400 });
  if (!(await checkCourierEnabled(brandId, "zoom"))) {
    return NextResponse.json({ error: "Zoom access is disabled for this brand." }, { status: 403 });
  }

  try {
    return NextResponse.json(await fetchZoomCatalog(brandId));
  } catch (error: any) {
    console.error("Zoom catalog fetch error:", error);
    return NextResponse.json({ error: error.message || "Failed to load Zoom catalog" }, { status: 502 });
  }
}