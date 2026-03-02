import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { scrapeLeopardsTracking } from "@/lib/leopards";

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
        const trackingData = await scrapeLeopardsTracking(trackingNumber);

        if (!trackingData) {
            return NextResponse.json({ error: "No tracking data found for this tracking number." }, { status: 404 });
        }

        return NextResponse.json({
            trackingNumber,
            shipper: trackingData.shipper,
            origin: trackingData.origin,
            consigneeName: trackingData.consigneeName,
            destination: trackingData.destination,
            currentStatus: trackingData.currentStatus,
            lastUpdate: trackingData.lastUpdate,
            trackingHistory: trackingData.trackingHistory,
        });
    } catch (err: any) {
        console.error("Leopards tracking scrape error:", err);
        return NextResponse.json({ error: err.message || "Failed to fetch tracking info" }, { status: 500 });
    }
}
