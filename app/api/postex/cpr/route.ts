import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function decodeJwtPayload(token: string): any {
    try {
        const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
        const parts = cleanToken.split(".");
        if (parts.length !== 3) return null;
        const payload = Buffer.from(parts[1], "base64url").toString("utf8");
        return JSON.parse(payload);
    } catch {
        return null;
    }
}

async function resolveMerchantId(brand: any): Promise<string> {
    let merchantId = brand.postexMerchantId || "";
    if (!merchantId) {
        const cleanToken = brand.postexMerchantToken.replace(/^Bearer\s+/i, "").trim();
        const decoded = decodeJwtPayload(cleanToken);
        if (decoded?.userDetails?.merchantId) {
            merchantId = String(decoded.userDetails.merchantId);
            await prisma.brand.update({
                where: { id: brand.id },
                data: { postexMerchantId: merchantId }
            });
        }
    }
    return merchantId;
}

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id") || "";
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("statusId") || "";
    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";

    if (!brandId) {
        return NextResponse.json({ error: "Missing brand ID" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
        return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    const where: any = { brandId };

    if (statusFilter && statusFilter !== "all") {
        where.statusId = parseInt(statusFilter);
    }

    if (fromDate || toDate) {
        where.createDatetime = {};
        if (fromDate) where.createDatetime.gte = fromDate;
        if (toDate) where.createDatetime.lte = toDate + "T23:59:59";
    }

    const receipts = await (prisma as any).postexCpr.findMany({
        where,
        orderBy: { createDatetime: "desc" }
    });

    const mapped = receipts.map((r: any) => ({
        cashPaymentReceiptMasterId: r.cprId,
        merchantId: r.merchantId,
        merchantName: r.merchantName,
        cashPaymentReceiptNumber: r.cprNumber,
        cashPaymentReceiptStatusId: r.statusId,
        cashPaymentReceiptStatus: r.status,
        createDatetime: r.createDatetime,
        approveDate: r.approveDate,
        netAmount: String(r.netAmount),
    }));

    return NextResponse.json({
        receipts: mapped,
        merchantId: brand.postexMerchantId || "",
        source: "database"
    });
}

export async function POST(req: NextRequest) {
    const brandId = req.headers.get("brand-id") || "";

    if (!brandId) {
        return NextResponse.json({ error: "Missing brand ID" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.postexMerchantToken) {
        return NextResponse.json({ error: "PostEx Merchant Token not configured. Please add it in Settings." }, { status: 401 });
    }

    const merchantId = await resolveMerchantId(brand);
    if (!merchantId) {
        return NextResponse.json({ error: "Could not determine merchant ID. Please set it in brand settings." }, { status: 400 });
    }

    const cleanToken = brand.postexMerchantToken.replace(/^Bearer\s+/i, "").trim();

    const existingReceipts = await (prisma as any).postexCpr.findMany({
        where: { brandId },
        select: { cprId: true, statusId: true, netAmount: true }
    });
    const existingMap = new Map<number, { cprId: number; statusId: number; netAmount: number }>(
        existingReceipts.map((r: any) => [r.cprId, r])
    );

    let allReceipts: any[] = [];
    let page = 0;
    const size = 200;

    try {
        while (true) {
            const params = new URLSearchParams();
            params.set("size", String(size));
            params.set("page", String(page));

            const url = `https://api.postex.pk/services/merchant/api/payment/merchant/${merchantId}/cpr?${params.toString()}`;
            console.log(`Fetching PostEx CPR page ${page}: ${url}`);

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${cleanToken}`,
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`PostEx CPR API error: ${response.status} - ${errText}`);
                return NextResponse.json({ error: `PostEx API error: ${response.status}` }, { status: response.status });
            }

            const data = await response.json();
            const receipts = data.dist || [];
            allReceipts = allReceipts.concat(receipts);

            const pagination = data.pagination || {};
            const totalPages = pagination.totalPages || 1;
            page++;
            if (page >= totalPages) break;
        }

        let newCount = 0;
        let updatedCount = 0;

        for (const r of allReceipts) {
            const cprId = r.cashPaymentReceiptMasterId;
            const existing = existingMap.get(cprId);

            const record = {
                brandId,
                merchantId: String(r.merchantId || merchantId),
                merchantName: r.merchantName || "",
                cprNumber: r.cashPaymentReceiptNumber || "",
                statusId: r.cashPaymentReceiptStatusId || 0,
                status: r.cashPaymentReceiptStatus || "",
                netAmount: parseFloat(r.netAmount || "0"),
                createDatetime: r.createDatetime || "",
                approveDate: r.approveDate || "",
                lastFetchedAt: new Date()
            };

            if (!existing) {
                newCount++;
            } else if (existing.statusId !== record.statusId || existing.netAmount !== record.netAmount) {
                updatedCount++;
            }

            await (prisma as any).postexCpr.upsert({
                where: { cprId },
                update: record,
                create: { cprId, ...record }
            });
        }

        return NextResponse.json({
            success: true,
            merchantId,
            totalFetched: allReceipts.length,
            newReceipts: newCount,
            updatedReceipts: updatedCount,
            source: "api"
        });
    } catch (error: any) {
        console.error("PostEx CPR sync error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
