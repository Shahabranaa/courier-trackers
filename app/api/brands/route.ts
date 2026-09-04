import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
    try {
        const authUser = await getAuthUser();
        if (!authUser) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        let brands;
        if (authUser.role === "ADMIN") {
            brands = await prisma.brand.findMany({ orderBy: { createdAt: 'asc' } });
        } else {
            const ownBrands = await prisma.brand.findMany({ where: { userId: authUser.id }, orderBy: { createdAt: 'asc' } });
            const assignedAccess = await prisma.userBrand.findMany({
                where: { userId: authUser.id },
                include: { brand: true }
            });
            const assignedBrands = assignedAccess.map(ub => ub.brand);
            const brandMap = new Map<string, typeof ownBrands[0]>();
            for (const b of ownBrands) brandMap.set(b.id, b);
            for (const b of assignedBrands) if (!brandMap.has(b.id)) brandMap.set(b.id, b);
            brands = Array.from(brandMap.values());
        }
        const safeBrands = brands.map(b => ({
            ...b,
            shopifyAccessToken: b.shopifyAccessToken ? "••••••••" : "",
            shopifyClientSecret: b.shopifyClientSecret ? "••••••••" : "",
            postexMerchantToken: b.postexMerchantToken ? "••••••••" : "",
            tranzoMerchantToken: b.tranzoMerchantToken ? "••••••••" : "",
            tcsBearerToken: b.tcsBearerToken ? "••••••••" : "",
            tcsApiPassword: b.tcsApiPassword ? "••••••••" : "",
            wetarseelAuthToken: b.wetarseelAuthToken ? "••••••••" : "",
            leopardsApiKey: b.leopardsApiKey ? "••••••••" : "",
            leopardsApiPassword: b.leopardsApiPassword ? "••••••••" : "",
            isActive: b.isActive,
            selectedPackage: b.selectedPackage,
            packageRequestedAt: b.packageRequestedAt,
            activatedAt: b.activatedAt
        }));
        return NextResponse.json(safeBrands);
    } catch (error: any) {
        console.error("Failed to fetch brands:", error.message);
        return NextResponse.json({ error: "Failed to fetch brands" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const authUser = await getAuthUser();
        if (!authUser) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        }

        const body = await req.json();
        const { name, apiToken, tranzoToken, tranzoApiToken, proxyUrl, shopifyStore, shopifyAccessToken, shopifyClientId, shopifyClientSecret, postexMerchantId, postexMerchantToken, tranzoMerchantToken, tcsBearerToken, tcsApiUsername, tcsApiPassword, tcsCustomerNumber, wetarseelAccountId, wetarseelUserId, wetarseelAuthToken, leopardsApiKey, leopardsApiPassword, leopardsEnabled } = body;

        if (!name) {
            return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
        }

        const isAdminCreator = authUser.role === "ADMIN";
        const brand = await prisma.brand.create({
            data: {
                name,
                userId: authUser.id,
                apiToken: apiToken || "",
                tranzoToken: tranzoToken || "",
                tranzoApiToken: tranzoApiToken || "",
                proxyUrl: proxyUrl || "",
                shopifyStore: shopifyStore || "",
                shopifyAccessToken: shopifyAccessToken || "",
                shopifyClientId: shopifyClientId || "",
                shopifyClientSecret: shopifyClientSecret || "",
                postexMerchantId: postexMerchantId || "",
                postexMerchantToken: postexMerchantToken || "",
                tranzoMerchantToken: tranzoMerchantToken || "",
                tcsBearerToken: tcsBearerToken || "",
                tcsApiUsername: tcsApiUsername || "",
                tcsApiPassword: tcsApiPassword || "",
                tcsCustomerNumber: tcsCustomerNumber || "",
                wetarseelAccountId: wetarseelAccountId || "",
                wetarseelUserId: wetarseelUserId || "",
                wetarseelAuthToken: wetarseelAuthToken || "",
                leopardsApiKey: leopardsApiKey || "",
                leopardsApiPassword: leopardsApiPassword || "",
                ...(leopardsEnabled !== undefined && { leopardsEnabled: Boolean(leopardsEnabled) }),
                isActive: isAdminCreator,
                activatedAt: isAdminCreator ? new Date() : null
            }
        });

        return NextResponse.json({
            ...brand,
            shopifyAccessToken: brand.shopifyAccessToken ? "••••••••" : "",
            shopifyClientSecret: brand.shopifyClientSecret ? "••••••••" : "",
            postexMerchantToken: brand.postexMerchantToken ? "••••••••" : "",
            tranzoMerchantToken: brand.tranzoMerchantToken ? "••••••••" : "",
            tcsBearerToken: brand.tcsBearerToken ? "••••••••" : "",
            tcsApiPassword: brand.tcsApiPassword ? "••••••••" : "",
            wetarseelAuthToken: brand.wetarseelAuthToken ? "••••••••" : ""
            , leopardsApiKey: brand.leopardsApiKey ? "••••••••" : ""
            , leopardsApiPassword: brand.leopardsApiPassword ? "••••••••" : ""
        }, { status: 201 });
    } catch (error: any) {
        console.error("Failed to create brand:", error.message);
        return NextResponse.json({ error: "Failed to create brand" }, { status: 500 });
    }
}
