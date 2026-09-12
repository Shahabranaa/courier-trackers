import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const authUser = await getAuthUser();
        if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        const { id } = await params;
        if (authUser.role !== "ADMIN") {
            const [brand, access] = await Promise.all([
                prisma.brand.findUnique({ where: { id }, select: { userId: true, isActive: true } }),
                prisma.userBrand.findUnique({ where: { userId_brandId: { userId: authUser.id, brandId: id } } }),
            ]);
            if (!brand?.isActive || (brand.userId !== authUser.id && !access)) {
                return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
            }
        }
        const body = await req.json();
        const { name, apiToken, tranzoToken, tranzoApiToken, proxyUrl, shopifyStore, shopifyAccessToken, shopifyClientId, shopifyClientSecret, postexMerchantId, postexMerchantToken, tranzoMerchantToken, tcsBearerToken, tcsApiUsername, tcsApiPassword, tcsCustomerNumber, wetarseelAccountId, wetarseelUserId, wetarseelAuthToken, leopardsApiKey, leopardsApiPassword, mnpUsername, mnpPassword, mnpAccountNo, postexEnabled, tranzoEnabled, zoomEnabled, tcsEnabled, shopifyEnabled, leopardsEnabled, mnpEnabled, isActive, selectedPackage } = body;

        const shouldUpdateAccessToken = shopifyAccessToken !== undefined && shopifyAccessToken !== "••••••••";
        const shouldUpdateSecret = shopifyClientSecret !== undefined && shopifyClientSecret !== "••••••••";
        const shouldUpdateMerchantToken = postexMerchantToken !== undefined && postexMerchantToken !== "••••••••";
        const shouldUpdateTranzoMerchantToken = tranzoMerchantToken !== undefined && tranzoMerchantToken !== "••••••••";
        const shouldUpdateTcsBearerToken = tcsBearerToken !== undefined && tcsBearerToken !== "••••••••";
        const shouldUpdateTcsPassword = tcsApiPassword !== undefined && tcsApiPassword !== "••••••••";
        const shouldUpdateLeopardsKey = leopardsApiKey !== undefined && leopardsApiKey !== "••••••••";
        const shouldUpdateLeopardsPassword = leopardsApiPassword !== undefined && leopardsApiPassword !== "••••••••";
        const shouldUpdateMnpUsername = mnpUsername !== undefined && mnpUsername !== "••••••••";
        const shouldUpdateMnpPassword = mnpPassword !== undefined && mnpPassword !== "••••••••";
        const shouldUpdateMnpAccountNo = mnpAccountNo !== undefined && mnpAccountNo !== "••••••••";

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
                ...(shouldUpdateMnpUsername && { mnpUsername }),
                ...(shouldUpdateMnpPassword && { mnpPassword }),
                ...(shouldUpdateMnpAccountNo && { mnpAccountNo }),
                ...(postexEnabled !== undefined && { postexEnabled: Boolean(postexEnabled) }),
                ...(tranzoEnabled !== undefined && { tranzoEnabled: Boolean(tranzoEnabled) }),
                ...(zoomEnabled !== undefined && { zoomEnabled: Boolean(zoomEnabled) }),
                ...(tcsEnabled !== undefined && { tcsEnabled: Boolean(tcsEnabled) }),
                ...(shopifyEnabled !== undefined && { shopifyEnabled: Boolean(shopifyEnabled) }),
                ...(leopardsEnabled !== undefined && { leopardsEnabled: Boolean(leopardsEnabled) }),
                ...(mnpEnabled !== undefined && { mnpEnabled: Boolean(mnpEnabled) }),
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
             leopardsApiPassword: brand.leopardsApiPassword ? "••••••••" : "",
             mnpUsername: brand.mnpUsername ? "••••••••" : "",
             mnpPassword: brand.mnpPassword ? "••••••••" : "",
             mnpAccountNo: brand.mnpAccountNo ? "••••••••" : ""
        });
    } catch (error: any) {
        console.error("Failed to update brand:", error.message);
        return NextResponse.json({ error: "Failed to update brand" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const authUser = await getAuthUser();
        if (!authUser) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
        const { id } = await params;
        if (authUser.role !== "ADMIN") {
            const brand = await prisma.brand.findUnique({ where: { id }, select: { userId: true } });
            if (brand?.userId !== authUser.id) return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
        }
        await prisma.brand.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Failed to delete brand:", error.message);
        return NextResponse.json({ error: "Failed to delete brand" }, { status: 500 });
    }
}
