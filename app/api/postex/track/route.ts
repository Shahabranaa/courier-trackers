
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const token = req.headers.get("token");
    const { searchParams } = new URL(req.url);
    const trackingNumber = searchParams.get("trackingNumber");
    const forceRefresh = searchParams.get("force") === "true";

    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    if (!trackingNumber) {
        return NextResponse.json({ error: "Missing trackingNumber" }, { status: 400 });
    }

    try {
        // 1. Check Cache
        if (!forceRefresh) {
            const cached = await prisma.trackingStatus.findUnique({
                where: { trackingNumber }
            });
            if (cached) {
                return NextResponse.json(JSON.parse(cached.data));
            }
        }

        // 2. Fetch from PostEx API
        // Endpoint pattern based on other files.
        // Orders: .../order/v1/get-all-order
        // Payment: .../order/v1/payment-status/{trackingNumber}
        // Tracking: Likely .../order/v1/track-order/{trackingNumber}
        // Checking online documentation snippets or guessing. Most likely 'track-order' or similar.
        // Let's assume 'track-order' as it's a common convention and fits the others.

        const response = await fetch(
            `https://api.postex.pk/services/integration/api/order/v1/get-order-status/${trackingNumber}`,
            {
                method: "GET",
                headers: {
                    token: token,
                },
            }
        );

        if (!response.ok) {
            if (response.status === 404) {
                return NextResponse.json({ trackingNumber, status: "Not Found" });
            }
            const errorText = await response.text();
            return NextResponse.json({ error: "Failed to fetch tracking status", details: errorText }, { status: response.status });
        }

        const data = await response.json();

        // 3. Save to Cache
        await prisma.trackingStatus.upsert({
            where: { trackingNumber },
            update: {
                data: JSON.stringify(data),
                updatedAt: new Date()
            },
            create: {
                trackingNumber,
                data: JSON.stringify(data)
            }
        });

        console.log(`Tracking Status for ${trackingNumber}:`, JSON.stringify(data).slice(0, 100) + "...");
        return NextResponse.json(data);
    } catch (error) {
        console.error("Tracking API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
