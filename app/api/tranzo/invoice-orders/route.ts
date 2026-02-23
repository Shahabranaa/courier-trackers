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
            const results = data.results || data.data || [];
            allOrders.push(...results);

            const totalCount = data.count || data.total || 0;
            if (!data.next || allOrders.length >= totalCount) {
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
