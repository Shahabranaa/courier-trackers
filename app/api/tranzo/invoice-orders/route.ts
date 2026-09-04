import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id") || "";
    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get("invoice_id");

    if (!brandId) {
        return NextResponse.json({ error: "Missing brand ID" }, { status: 400 });
    }

    if (!invoiceId) {
        return NextResponse.json({ error: "Missing invoice_id parameter" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.tranzoMerchantToken) {
        return NextResponse.json({ error: "Tranzo Merchant Token not configured. Please add it in Settings." }, { status: 401 });
    }

    const cleanToken = brand.tranzoMerchantToken.replace(/^Bearer\s+/i, "").trim();

    try {
        const allOrders: any[] = [];
        let currentPage = 1;
        let hasMore = true;

        while (hasMore) {
            const url = `https://api-merchant.tranzo.pk/merchant/api/v1/invoice-sheet-orders?invoice_master_id=${invoiceId}&page=${currentPage}&limit=100`;
            console.log(`Fetching Tranzo invoice orders: ${url}`);

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${cleanToken}`,
                    "Accept": "application/json"
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`Tranzo Invoice Orders API error: ${response.status} - ${errText}`);
                return NextResponse.json({ error: `Tranzo API error: ${response.status}` }, { status: response.status });
            }

            const data = await response.json();
            console.log(`Tranzo invoice-orders response (page ${currentPage}): keys=${JSON.stringify(Object.keys(data))}, type=${typeof data}, isArray=${Array.isArray(data)}`);

            let results: any[] = [];

            if (Array.isArray(data)) {
                results = data;
            } else if (data.results && Array.isArray(data.results)) {
                results = data.results;
            } else if (data.data && Array.isArray(data.data)) {
                results = data.data;
            } else if (data.orders && Array.isArray(data.orders)) {
                results = data.orders;
            } else {
                console.log(`Unexpected response structure (first 1000 chars): ${JSON.stringify(data).substring(0, 1000)}`);
            }

            if (results.length > 0 && currentPage === 1) {
                console.log(`First order sample keys: ${JSON.stringify(Object.keys(results[0]))}`);
            }

            allOrders.push(...results);

            const totalCount = data.count || data.total || 0;
            if (!data.next || allOrders.length >= totalCount || results.length === 0) {
                hasMore = false;
            } else {
                currentPage++;
            }

            if (currentPage > 50) break;
        }

        console.log(`Fetched ${allOrders.length} orders for invoice ${invoiceId} (brand ${brandId})`);

        return NextResponse.json({
            count: allOrders.length,
            invoice_id: invoiceId,
            orders: allOrders,
        });
    } catch (error: any) {
        console.error("Tranzo Invoice Orders fetch error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
