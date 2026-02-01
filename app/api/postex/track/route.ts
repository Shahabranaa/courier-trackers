import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const token = req.headers.get("token");
    const { searchParams } = new URL(req.url);
    const trackingNumber = searchParams.get("trackingNumber");

    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    if (!trackingNumber) {
        return NextResponse.json({ error: "Missing trackingNumber" }, { status: 400 });
    }

    try {
        const response = await fetch(
            `https://api.postex.pk/services/integration/api/order/v1/track-order/${trackingNumber}`,
            {
                method: "GET",
                headers: {
                    token: token,
                },
            }
        );

        if (!response.ok) {
            // Allow 404 for untracked orders without failing the whole batch
            if (response.status === 404) {
                return NextResponse.json({ trackingNumber, status: "Not Found" });
            }
            const errorText = await response.text();
            return NextResponse.json({ error: "Failed to fetch tracking", details: errorText }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
