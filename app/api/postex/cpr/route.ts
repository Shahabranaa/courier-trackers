import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function decodeJwtPayload(token: string): any {
    try {
        const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
        const parts = cleanToken.split(".");
        if (parts.length !== 3) {
            console.log(`Token is not JWT format (${parts.length} parts). First 20 chars: ${cleanToken.substring(0, 20)}...`);
            return null;
        }
        let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (base64.length % 4) base64 += "=";
        const payload = Buffer.from(base64, "base64").toString("utf8");
        return JSON.parse(payload);
    } catch (e) {
        console.error("JWT decode error:", e);
        return null;
    }
}

export async function GET(req: NextRequest) {
    const token = req.headers.get("token") || "";
    const brandId = req.headers.get("brand-id") || "default";
    const merchantIdHeader = req.headers.get("merchant-id") || "";
    const { searchParams } = new URL(req.url);

    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";
    const statusId = searchParams.get("statusId") || "";
    const size = searchParams.get("size") || "100";
    const page = searchParams.get("page") || "0";

    if (!token) {
        return NextResponse.json({ error: "Missing PostEx API token" }, { status: 401 });
    }

    console.log(`CPR request - brandId: ${brandId}, merchantIdHeader: "${merchantIdHeader}", token length: ${token.length}, token starts with: ${token.substring(0, 30)}...`);

    let merchantId = merchantIdHeader;

    if (!merchantId && brandId !== "default") {
        try {
            const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postexMerchantId: true } });
            console.log(`DB lookup result for brand ${brandId}: postexMerchantId = "${brand?.postexMerchantId}"`);
            if (brand?.postexMerchantId) {
                merchantId = brand.postexMerchantId;
            }
        } catch (e: any) {
            console.error("Failed to lookup brand merchantId:", e.message);
        }
    }

    if (!merchantId) {
        const decoded = decodeJwtPayload(token);
        console.log("JWT decoded payload:", JSON.stringify(decoded));
        if (decoded?.userDetails?.merchantId) {
            merchantId = String(decoded.userDetails.merchantId);
            console.log(`Extracted merchantId from JWT: ${merchantId}`);
        }
    }

    if (!merchantId) {
        return NextResponse.json({ 
            error: "Could not determine merchant ID. Please enter your PostEx Merchant ID in Settings (e.g. 53117).",
            debug: {
                tokenLength: token.length,
                tokenPreview: token.substring(0, 20) + "...",
                isJWT: token.split(".").length === 3,
                brandId
            }
        }, { status: 400 });
    }

    if (!merchantIdHeader && brandId !== "default") {
        try {
            await prisma.brand.update({ where: { id: brandId }, data: { postexMerchantId: merchantId } });
            console.log(`Auto-saved merchantId ${merchantId} to brand ${brandId}`);
        } catch (e: any) {
            console.error("Failed to auto-save merchantId:", e.message);
        }
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
                "Authorization": `Bearer ${token.replace(/^Bearer\s+/i, "").trim()}`,
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
