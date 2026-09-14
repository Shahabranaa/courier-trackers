import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { checkCourierEnabled } from "@/lib/courierAccess";
import { fetchZoomOrders, persistZoomOrders } from "@/lib/zoom";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.headers.get("brand-id");
  if (!brandId) return NextResponse.json({ error: "brand-id header is required" }, { status: 400 });
  if (!(await checkCourierEnabled(brandId, "zoom"))) {
    return NextResponse.json({ error: "Zoom access is disabled for this brand." }, { status: 403 });
  }

  try {
    const orders = await fetchZoomOrders(brandId);
    const synced = await persistZoomOrders(brandId, orders);
    return NextResponse.json({
      success: true,
      source: "zoom-api",
      totalZoomOrders: orders.length,
      synced,
      failed: orders.length - synced,
    });
  } catch (error: any) {
    console.error("Zoom API sync error:", error);
    return NextResponse.json({ error: error.message || "Failed to sync Zoom orders" }, { status: 502 });
  }
}