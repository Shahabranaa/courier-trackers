import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const WETARSEEL_APP = "https://app.wetarseel.ai";
const NEXT_ACTION_ID = "40b7dfbe5dbbb47884aaa28294a89ad757ab033505";

export async function POST(req: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header required" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand || !brand.wetarseelAccountId || !brand.wetarseelUserId) {
        return NextResponse.json({ error: "WeTarSeel not configured" }, { status: 400 });
    }

    if (!brand.wetarseelAuthToken) {
        return NextResponse.json({ error: "WeTarSeel auth token not set. Add it in Settings to enable replies." }, { status: 400 });
    }

    const body = await req.json();
    const { convo_id, message, contact_id, convoData } = body;

    if (!convo_id || !message) {
        return NextResponse.json({ error: "convo_id and message are required" }, { status: 400 });
    }

    const pbAuthCookie = JSON.stringify({
        token: brand.wetarseelAuthToken,
        record: {
            id: brand.wetarseelUserId,
            collectionId: "_pb_users_auth_",
            collectionName: "users",
        }
    });

    const routerStateTree = JSON.stringify([
        "",
        {
            children: [
                ["account_id", brand.wetarseelAccountId, "d"],
                {
                    children: [
                        "live-chat",
                        { children: ["__PAGE__", {}, null, null] },
                        null,
                        null
                    ]
                },
                null,
                null
            ]
        },
        null,
        null,
        true
    ]);

    const actionBody = JSON.stringify([
        convoData || {
            convoFromDb: {
                convo_id: convo_id,
                from: contact_id || "",
            },
            unread_count: 0,
        },
        message
    ]);

    try {
        const res = await fetch(`${WETARSEEL_APP}/${brand.wetarseelAccountId}/live-chat`, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain;charset=UTF-8",
                "Accept": "text/x-component",
                "next-action": NEXT_ACTION_ID,
                "next-router-state-tree": encodeURIComponent(routerStateTree),
                "Cookie": `pb_auth=${encodeURIComponent(pbAuthCookie)}`,
                "Origin": WETARSEEL_APP,
                "Referer": `${WETARSEEL_APP}/${brand.wetarseelAccountId}/live-chat`,
            },
            body: actionBody,
            redirect: "follow",
        });

        if (res.ok || res.status === 200 || res.status === 303) {
            return NextResponse.json({ success: true });
        }

        const errorText = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
            return NextResponse.json({
                error: "Auth token expired or invalid. Update your WeTarSeel Auth Token in Settings."
            }, { status: 401 });
        }

        return NextResponse.json({
            error: `WeTarSeel returned status ${res.status}. Try updating your auth token in Settings.`,
            details: errorText.substring(0, 200)
        }, { status: 502 });
    } catch (err: any) {
        return NextResponse.json({
            error: err.message || "Failed to send message",
        }, { status: 500 });
    }
}
