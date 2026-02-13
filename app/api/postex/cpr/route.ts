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

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id") || "";
    const { searchParams } = new URL(req.url);

    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";
    const statusId = searchParams.get("statusId") || "";
    const size = searchParams.get("size") || "100";
    const page = searchParams.get("page") || "0";

    if (!brandId) {
        return NextResponse.json({ error: "Missing brand ID" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.postexMerchantToken) {
        return NextResponse.json({ error: "PostEx Merchant Token not configured. Please add it in Settings." }, { status: 401 });
    }

    const cleanToken = brand.postexMerchantToken.replace(/^Bearer\s+/i, "").trim();

    let merchantId = brand.postexMerchantId || "";
    if (!merchantId) {
        const decoded = decodeJwtPayload(cleanToken);
        if (decoded?.userDetails?.merchantId) {
            merchantId = String(decoded.userDetails.merchantId);
            await prisma.brand.update({
                where: { id: brandId },
                data: { postexMerchantId: merchantId }
            });
        }
    }

    if (!merchantId) {
        return NextResponse.json({ error: "Could not determine merchant ID. Please set it in brand settings." }, { status: 400 });
    }

    try {
        const params = new URLSearchParams();
        params.set("size", size);
        params.set("page", page);
        if (fromDate) params.set("fromDate", fromDate);
        if (toDate) params.set("toDate", toDate);
        if (statusId) params.set("cashPaymentReceiptStatusId", statusId);

        const url = `https://api.postex.pk/services/merchant/api/payment/merchant/${merchantId}/cpr?${params.toString()}`;
        console.log(`Fetching PostEx CPR: ${url}`);

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

        return NextResponse.json({
            statusCode: data.statusCode,
            statusMessage: data.statusMessage,
            receipts: data.dist || [],
            pagination: data.pagination || { page: 0, size: 25, totalElements: 0, numberOfElements: 0, totalPages: 0 },
            merchantId
        });
    } catch (error: any) {
        console.error("PostEx CPR fetch error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
