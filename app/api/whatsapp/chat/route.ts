import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const WETARSEEL_BASE = "https://bun.dubai.wetarseel.ai";

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header required" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.wetarseelAccountId || !brand.wetarseelUserId) {
        return NextResponse.json({ error: "WeTarSeel not configured" }, { status: 400 });
    }

    const convoId = req.nextUrl.searchParams.get("convo_id");
    if (!convoId) {
        return NextResponse.json({ error: "convo_id required" }, { status: 400 });
    }

    const limit = req.nextUrl.searchParams.get("limit") || "50";

    try {
        const url = `${WETARSEEL_BASE}/get-messages?account_id=${brand.wetarseelAccountId}&convo_id=${convoId}&limit=${limit}`;

        const res = await fetch(url, {
            headers: { "Accept": "application/json" },
            next: { revalidate: 0 }
        });

        if (!res.ok) {
            return NextResponse.json({ error: "Failed to fetch messages" }, { status: res.status });
        }

        const messages = await res.json();
        return NextResponse.json({ messages });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to fetch messages" }, { status: 500 });
    }
}
