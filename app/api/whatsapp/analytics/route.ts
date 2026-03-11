import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const WETARSEEL_BASE = "https://bun-prod-new.app.wetarseel.ai";

function normalizePhone(phone: string): string {
    if (!phone) return "";
    let cleaned = phone.replace(/[^0-9]/g, "");
    if (cleaned.startsWith("0092")) {
        cleaned = cleaned.slice(4);
    } else if (cleaned.startsWith("92") && cleaned.length >= 11) {
        cleaned = cleaned.slice(2);
    }
    if (cleaned.startsWith("0")) {
        cleaned = cleaned.slice(1);
    }
    return cleaned;
}

export async function GET(req: NextRequest) {
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

    const startDate = req.nextUrl.searchParams.get("startDate");
    const endDate = req.nextUrl.searchParams.get("endDate");

    try {
        const convosUrl = `${WETARSEEL_BASE}/get-conversations?account_id=${brand.wetarseelAccountId}&limit=1000&super_access=true&view_all_chats=true&view_unassigned_chats=true&current_user_id=${brand.wetarseelUserId}&view_not_started_chats=true`;
        const convosRes = await fetch(convosUrl, {
            headers: { "Accept": "application/json" },
            next: { revalidate: 0 },
        });

        if (!convosRes.ok) {
            return NextResponse.json({ error: "Failed to fetch conversations" }, { status: convosRes.status });
        }

        const conversations: any[] = await convosRes.json();

        const convosByPhone = new Map<string, any>();
        for (const c of conversations) {
            const norm = normalizePhone(c.phone_number || "");
            if (!norm || norm.length < 9) continue;
            if (!convosByPhone.has(norm)) {
                convosByPhone.set(norm, c);
            }
        }

        const dateStart = startDate ? new Date(startDate + "T00:00:00Z") : null;
        const dateEnd = endDate ? new Date(endDate + "T23:59:59Z") : null;

        const messagesInRange = conversations.filter(c => {
            if (!c.last_message_created) return false;
            const msgDate = new Date(c.last_message_created);
            if (dateStart && msgDate < dateStart) return false;
            if (dateEnd && msgDate > dateEnd) return false;
            return true;
        });

        const whereClause: any = { brandId };
        if (dateStart && dateEnd) {
            whereClause.createdAt = {
                gte: dateStart.toISOString(),
                lte: dateEnd.toISOString(),
            };
        }

        const shopifyOrders = await prisma.shopifyOrder.findMany({
            where: whereClause,
            select: {
                shopifyOrderId: true,
                orderName: true,
                orderNumber: true,
                phone: true,
                createdAt: true,
                customerName: true,
                totalPrice: true,
            },
        });

        const dailyStats: Record<string, { totalOrders: number; matched: number; revenue: number; messages: number }> = {};
        let totalMatched = 0;
        let totalRevenue = 0;
        const orderMap: Record<string, { orderName: string; orderNumber: string }[]> = {};

        for (const order of shopifyOrders) {
            const orderDate = new Date(order.createdAt);
            const day = orderDate.toISOString().split("T")[0];

            if (!dailyStats[day]) dailyStats[day] = { totalOrders: 0, matched: 0, revenue: 0, messages: 0 };
            dailyStats[day].totalOrders++;

            const norm = normalizePhone(order.phone || "");
            if (norm && convosByPhone.has(norm)) {
                const convo = convosByPhone.get(norm)!;
                totalMatched++;
                totalRevenue += order.totalPrice || 0;
                dailyStats[day].matched++;
                dailyStats[day].revenue += order.totalPrice || 0;
                if (!orderMap[convo.convo_id]) orderMap[convo.convo_id] = [];
                orderMap[convo.convo_id].push({
                    orderName: order.orderName,
                    orderNumber: order.orderNumber,
                });
            }
        }

        for (const c of messagesInRange) {
            if (!c.last_message_created) continue;
            const msgDate = new Date(c.last_message_created);
            const day = msgDate.toISOString().split("T")[0];
            if (!dailyStats[day]) dailyStats[day] = { totalOrders: 0, matched: 0, revenue: 0, messages: 0 };
            dailyStats[day].messages++;
        }

        const sortedDays = Object.entries(dailyStats)
            .map(([date, stats]) => ({
                date,
                total: stats.totalOrders,
                messages: stats.messages,
                converted: stats.matched,
                conversionRate: stats.totalOrders > 0 ? Math.round((stats.matched / stats.totalOrders) * 100) : 0,
                revenue: stats.revenue,
            }))
            .sort((a, b) => b.date.localeCompare(a.date));

        const totals = {
            totalConversations: messagesInRange.length,
            totalOrders: shopifyOrders.length,
            totalConverted: totalMatched,
            conversionRate: shopifyOrders.length > 0 ? Math.round((totalMatched / shopifyOrders.length) * 100) : 0,
            totalRevenue,
        };

        return NextResponse.json({
            totals,
            dailyStats: sortedDays,
            orderMap,
        });
    } catch (err: any) {
        console.error("WhatsApp analytics error:", err);
        return NextResponse.json({ error: err.message || "Failed to compute analytics" }, { status: 500 });
    }
}
