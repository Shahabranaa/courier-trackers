import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { checkCourierEnabled } from "@/lib/courierAccess";
import { fetchZoomTracking } from "@/lib/zoom";

export async function GET(req: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const trackingNumber = searchParams.get("trackingNumber");

    if (!trackingNumber) {
        return NextResponse.json({ error: "Missing trackingNumber parameter" }, { status: 400 });
    }

    try {
        const brandId = req.headers.get("brand-id");
        if (!brandId) return NextResponse.json({ error: "brand-id header is required" }, { status: 400 });
        if (!(await checkCourierEnabled(brandId, "zoom"))) {
            return NextResponse.json({ error: "Zoom access is disabled for this brand." }, { status: 403 });
        }

        return NextResponse.json(await fetchZoomTracking(trackingNumber));
    } catch (err: any) {
        console.error("Zoom tracking API error:", err);
        return NextResponse.json({ error: err.message || "Failed to fetch tracking info" }, { status: 502 });
    }
}
