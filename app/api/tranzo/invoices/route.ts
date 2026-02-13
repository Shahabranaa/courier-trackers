import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id") || "";

    if (!brandId) {
        return NextResponse.json({ error: "Missing brand ID" }, { status: 400 });
    }

    try {
        const invoices = await prisma.tranzoInvoice.findMany({
            where: { brandId },
            orderBy: { createdAt: "desc" }
        });

        const results = invoices.map(inv => ({
            id: inv.invoiceId,
            invoice_number: inv.invoiceNumber,
            invoice_type: inv.invoiceType,
            merchant: inv.merchant,
            merchant_store: inv.merchantStore,
            total_orders: inv.totalOrders,
            net_amount: String(inv.netAmount),
            created_at: inv.createdAt,
            created_by: inv.createdBy,
            invoice_status: inv.invoiceStatus,
            approved_at: inv.approvedAt,
            approved_by: inv.approvedBy,
            hold_at: inv.holdAt,
            hold_by: inv.holdBy,
            settled_at: inv.settledAt,
            settled_by: inv.settledBy,
            disputed_at: inv.disputedAt,
            disputed_by: inv.disputedBy,
        }));

        console.log(`Served ${results.length} Tranzo invoices from DB for brand ${brandId}`);
        return NextResponse.json({
            count: results.length,
            results,
            source: "local"
        });
    } catch (error: any) {
        console.error("Tranzo Invoice DB read error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const brandId = req.headers.get("brand-id") || "";

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

        let upsertCount = 0;
        for (const inv of allResults) {
            const invoiceData = {
                invoiceNumber: inv.invoice_number || "",
                invoiceType: inv.invoice_type || "",
                merchant: inv.merchant || "",
                merchantStore: inv.merchant_store || null,
                totalOrders: inv.total_orders || 0,
                netAmount: parseFloat(inv.net_amount || "0"),
                invoiceStatus: inv.invoice_status || "",
                createdAt: inv.created_at || "",
                createdBy: inv.created_by || "",
                approvedAt: inv.approved_at || null,
                approvedBy: inv.approved_by || null,
                holdAt: inv.hold_at || null,
                holdBy: inv.hold_by || null,
                settledAt: inv.settled_at || null,
                settledBy: inv.settled_by || null,
                disputedAt: inv.disputed_at || null,
                disputedBy: inv.disputed_by || null,
                lastFetchedAt: new Date(),
            };

            await prisma.tranzoInvoice.upsert({
                where: {
                    brandId_invoiceId: { brandId, invoiceId: inv.id }
                },
                update: invoiceData,
                create: {
                    invoiceId: inv.id,
                    brandId,
                    ...invoiceData,
                }
            });
            upsertCount++;
        }

        console.log(`Synced ${upsertCount} Tranzo invoices to DB for brand ${brandId}`);

        const savedInvoices = await prisma.tranzoInvoice.findMany({
            where: { brandId },
            orderBy: { createdAt: "desc" }
        });

        const results = savedInvoices.map(inv => ({
            id: inv.invoiceId,
            invoice_number: inv.invoiceNumber,
            invoice_type: inv.invoiceType,
            merchant: inv.merchant,
            merchant_store: inv.merchantStore,
            total_orders: inv.totalOrders,
            net_amount: String(inv.netAmount),
            created_at: inv.createdAt,
            created_by: inv.createdBy,
            invoice_status: inv.invoiceStatus,
            approved_at: inv.approvedAt,
            approved_by: inv.approvedBy,
            hold_at: inv.holdAt,
            hold_by: inv.holdBy,
            settled_at: inv.settledAt,
            settled_by: inv.settledBy,
            disputed_at: inv.disputedAt,
            disputed_by: inv.disputedBy,
        }));

        return NextResponse.json({
            count: results.length,
            results,
            synced: upsertCount,
            source: "api"
        });
    } catch (error: any) {
        console.error("Tranzo Invoice sync error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
