import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { getAuthUser } from "@/lib/auth";

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
        const url = `https://portal.zoomcod.com/track-detail.php?track_code=${encodeURIComponent(trackingNumber)}&track=`;

        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });

        if (!response.ok) {
            return NextResponse.json({ error: `Failed to fetch tracking page: ${response.status}` }, { status: 502 });
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const panelBody = $(".panel-body");

        if (panelBody.length === 0) {
            return NextResponse.json({ error: "Tracking information not found. The tracking number may be invalid." }, { status: 404 });
        }

        let shipper = "";
        let origin = "";
        let consigneeName = "";
        let destination = "";

        const shippingInfo = panelBody.find(".sender_info").first();
        shippingInfo.find("p").each((_, el) => {
            const text = $(el).text().trim();
            if (text.startsWith("Shipper:")) {
                shipper = text.replace("Shipper:", "").trim();
            } else if (text.startsWith("Origin:")) {
                origin = text.replace("Origin:", "").trim();
            }
        });

        const consigneeInfo = panelBody.find(".sender_info").eq(1);
        consigneeInfo.find("p").each((_, el) => {
            const text = $(el).text().trim();
            if (text.startsWith("Name:")) {
                consigneeName = text.replace("Name:", "").trim();
            } else if (text.startsWith("Destination:")) {
                destination = text.replace("Destination:", "").trim();
            }
        });

        const trackingHistory: { date: string; status: string }[] = [];
        panelBody.find(".table_info").first().find("tr").each((i, el) => {
            if (i === 0) return;
            const cells = $(el).find("td");
            if (cells.length >= 2) {
                trackingHistory.push({
                    date: $(cells[0]).text().trim(),
                    status: $(cells[1]).text().trim(),
                });
            }
        });

        if (trackingHistory.length === 0 && !shipper && !consigneeName) {
            return NextResponse.json({ error: "No tracking data found for this tracking number." }, { status: 404 });
        }

        const currentStatus = trackingHistory.length > 0
            ? trackingHistory[trackingHistory.length - 1].status
            : "Unknown";

        const lastUpdate = trackingHistory.length > 0
            ? trackingHistory[trackingHistory.length - 1].date
            : "";

        return NextResponse.json({
            trackingNumber,
            shipper,
            origin,
            consigneeName,
            destination,
            currentStatus,
            lastUpdate,
            trackingHistory,
        });
    } catch (err: any) {
        console.error("Zoom tracking scrape error:", err);
        return NextResponse.json({ error: err.message || "Failed to fetch tracking info" }, { status: 500 });
    }
}
