import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { name, apiToken, tranzoToken, tranzoApiToken, proxyUrl, shopifyStore, shopifyAccessToken, shopifyClientId, shopifyClientSecret, postexMerchantId, postexMerchantToken, tranzoMerchantToken, tcsBearerToken, tcsApiUsername, tcsApiPassword, tcsCustomerNumber, wetarseelAccountId, wetarseelUserId, wetarseelAuthToken, leopardsApiKey, leopardsApiPassword, leopardsEnabled, isActive, selectedPackage } = body;

        const shouldUpdateAccessToken = shopifyAccessToken !== undefined && shopifyAccessToken !== "••••••••";
        const shouldUpdateSecret = shopifyClientSecret !== undefined && shopifyClientSecret !== "••••••••";
        const shouldUpdateMerchantToken = postexMerchantToken !== undefined && postexMerchantToken !== "••••••••";
        const shouldUpdateTranzoMerchantToken = tranzoMerchantToken !== undefined && tranzoMerchantToken !== "••••••••";
        const shouldUpdateTcsBearerToken = tcsBearerToken !== undefined && tcsBearerToken !== "••••••••";
        const shouldUpdateTcsPassword = tcsApiPassword !== undefined && tcsApiPassword !== "••••••••";
        const shouldUpdateLeopardsKey = leopardsApiKey !== undefined && leopardsApiKey !== "••••••••";
        const shouldUpdateLeopardsPassword = leopardsApiPassword !== undefined && leopardsApiPassword !== "••••••••";

        const brand = await prisma.brand.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(apiToken !== undefined && { apiToken }),
                ...(tranzoToken !== undefined && { tranzoToken }),
                ...(tranzoApiToken !== undefined && { tranzoApiToken }),
                ...(proxyUrl !== undefined && { proxyUrl }),
                ...(shopifyStore !== undefined && { shopifyStore }),
                ...(shouldUpdateAccessToken && { shopifyAccessToken }),
                ...(shopifyClientId !== undefined && { shopifyClientId }),
                ...(shouldUpdateSecret && { shopifyClientSecret }),
                ...(postexMerchantId !== undefined && { postexMerchantId }),
                ...(shouldUpdateMerchantToken && { postexMerchantToken }),
                ...(shouldUpdateTranzoMerchantToken && { tranzoMerchantToken }),
                ...(shouldUpdateTcsBearerToken && { tcsBearerToken }),
                ...(tcsApiUsername !== undefined && { tcsApiUsername }),
                ...(shouldUpdateTcsPassword && { tcsApiPassword }),
                ...(tcsCustomerNumber !== undefined && { tcsCustomerNumber }),
                ...(wetarseelAccountId !== undefined && { wetarseelAccountId }),
                ...(wetarseelUserId !== undefined && { wetarseelUserId }),
                ...((wetarseelAuthToken !== undefined && wetarseelAuthToken !== "••••••••") && { wetarseelAuthToken }),
                ...(shouldUpdateLeopardsKey && { leopardsApiKey }),
                ...(shouldUpdateLeopardsPassword && { leopardsApiPassword }),
                ...(leopardsEnabled !== undefined && { leopardsEnabled: Boolean(leopardsEnabled) }),
                ...(isActive !== undefined && { isActive, ...(isActive ? { activatedAt: new Date() } : {}) }),
                ...(selectedPackage !== undefined && { selectedPackage, packageRequestedAt: new Date() })
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
            wetarseelAuthToken: brand.wetarseelAuthToken ? "••••••••" : "",
            leopardsApiKey: brand.leopardsApiKey ? "••••••••" : "",
            leopardsApiPassword: brand.leopardsApiPassword ? "••••••••" : ""
        });
    } catch (error: any) {
        console.error("Failed to update brand:", error.message);
        return NextResponse.json({ error: "Failed to update brand" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.brand.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Failed to delete brand:", error.message);
        return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
    }
}
