import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { checkCourierEnabled } from "@/lib/courierAccess";
import { fetchZoomOrders } from "@/lib/zoom";

export async function GET(req: NextRequest) {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const brandId = req.headers.get("brand-id");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!brandId) {
        return NextResponse.json({ error: "brand-id header is required" }, { status: 400 });
    }

    if (!startDate || !endDate) {
        return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
    }

    try {
        if (!(await checkCourierEnabled(brandId, "zoom"))) {
            return NextResponse.json({ error: "Zoom access is disabled for this brand." }, { status: 403 });
        }

        const allOrders = await fetchZoomOrders(brandId);
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T23:59:59.999`);
        const orders = allOrders.filter(order => {
            const date = new Date(order.orderDate.replace(" ", "T"));
            return Number.isNaN(date.getTime()) || (date >= start && date <= end);
        });

        return NextResponse.json({
            source: "zoom-api",
            apiCount: allOrders.length,
            count: orders.length,
            orders,
        });
    } catch (error: any) {
        console.error("Zoom orders fetch failed:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
