import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const WETARSEEL_BASE = "https://bun-prod-new.app.wetarseel.ai";

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header required" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.wetarseelAccountId || !brand.wetarseelUserId) {
        return NextResponse.json({ error: "WeTarSeel not configured for this brand. Add Account ID and User ID in Settings." }, { status: 400 });
    }

    const limit = req.nextUrl.searchParams.get("limit") || "1000";

    try {
        const url = `${WETARSEEL_BASE}/get-conversations?account_id=${brand.wetarseelAccountId}&limit=${limit}&super_access=true&view_all_chats=true&view_unassigned_chats=true&current_user_id=${brand.wetarseelUserId}&view_not_started_chats=true`;

        const res = await fetch(url, {
            headers: { "Accept": "application/json" },
            next: { revalidate: 0 }
        });

        if (!res.ok) {
            return NextResponse.json({ error: "Failed to fetch from WeTarSeel" }, { status: res.status });
        }

        const conversations = await res.json();
        return NextResponse.json({ conversations });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to fetch conversations" }, { status: 500 });
    }
}
