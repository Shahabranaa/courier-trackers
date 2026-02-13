import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id") || "";
    const { searchParams } = new URL(req.url);

    const page = searchParams.get("page") || "1";
    const limit = searchParams.get("limit") || "100";

    if (!brandId) {
        return NextResponse.json({ error: "Missing brand ID" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.tranzoMerchantToken) {
        return NextResponse.json({ error: "Tranzo Merchant Token not configured. Please add it in Settings." }, { status: 401 });
    }

    const cleanToken = brand.tranzoMerchantToken.replace(/^Bearer\s+/i, "").trim();

    try {
        const allResults: any[] = [];
        let currentPage = 1;
        let totalCount = 0;
        let hasMore = true;

        while (hasMore) {
            const url = `https://api-merchant.tranzo.pk/merchant/api/v1/merchant-invoice-logs?page=${currentPage}&limit=50`;
            console.log(`Fetching Tranzo invoices: ${url}`);

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${cleanToken}`,
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`Tranzo Invoice API error: ${response.status} - ${errText}`);
                return NextResponse.json({ error: `Tranzo API error: ${response.status}` }, { status: response.status });
            }

            const data = await response.json();
            totalCount = data.count || 0;
            const results = data.results || [];
            allResults.push(...results);

            if (!data.next || allResults.length >= totalCount) {
                hasMore = false;
            } else {
                currentPage++;
            }

            if (currentPage > 20) break;
        }

        return NextResponse.json({
            count: totalCount,
            results: allResults
        });
    } catch (error: any) {
        console.error("Tranzo Invoice fetch error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
