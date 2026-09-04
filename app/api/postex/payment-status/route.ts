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
            const cached = await prisma.paymentStatus.findUnique({
                where: { trackingNumber }
            });
            if (cached) {
                return NextResponse.json(JSON.parse(cached.data));
            }
        }

        const response = await fetch(
            `https://api.postex.pk/services/integration/api/order/v1/payment-status/${trackingNumber}`,
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
            return NextResponse.json({ error: "Failed to fetch payment status", details: errorText }, { status: response.status });
        }

        const data = await response.json();

        // 3. Save to Cache
        await prisma.paymentStatus.upsert({
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

        console.log(`Payment Status for ${trackingNumber}:`, JSON.stringify(data));
        return NextResponse.json(data);
    } catch (error) {
        console.error("Payment API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
