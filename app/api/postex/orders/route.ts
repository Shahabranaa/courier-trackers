import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const token = req.headers.get("token");
    const { searchParams } = new URL(req.url);
    // PostEx API might not support date filtering in GET /get-all-order directly.
    // We might need to fetch all and filter, or paginate if supported. 
    // Docs say /get-all-order presumably returns a list. 

    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    try {
        const response = await fetch(
            "https://api.postex.pk/services/integration/api/order/v1/get-all-order",
            {
                method: "GET",
                headers: {
                    token: token,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error("PostEx Error:", errorText);
            return NextResponse.json({ error: "Failed to fetch orders from PostEx", details: errorText }, { status: response.status });
        }

        const data = await response.json();
        // Verify data structure. Assuming it returns an array on root or within a property.
        // Based on common practices, it might be { dist: [...] } or just [...]
        // Assuming user wants raw data for now, we pass it through.

        return NextResponse.json(data);
    } catch (error) {
        console.error("API Proxy Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
