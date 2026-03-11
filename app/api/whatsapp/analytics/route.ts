import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const WETARSEEL_BASE = "https://bun-prod-new.app.wetarseel.ai";

function normalizePhone(phone: string): string {
    if (!phone) return "";
    let cleaned = phone.replace(/[^0-9]/g, "");
    if (cleaned.startsWith("0092")) {
        cleaned = cleaned.slice(4);
    } else if (cleaned.startsWith("92") && cleaned.length >= 12) {
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

        const dateStart = startDate ? new Date(startDate + "T00:00:00Z") : null;
        const dateEnd = endDate ? new Date(endDate + "T23:59:59Z") : null;

        const filtered = conversations.filter(c => {
            if (!c.last_message_created) return false;
            const msgDate = new Date(c.last_message_created);
            if (dateStart && msgDate < dateStart) return false;
            if (dateEnd && msgDate > dateEnd) return false;
            return true;
        });

        const convoPhones = new Set<string>();
        const phoneToConvos = new Map<string, any[]>();

        for (const c of filtered) {
            const norm = normalizePhone(c.phone_number || "");
            if (!norm || norm.length < 10) continue;
            convoPhones.add(norm);
            if (!phoneToConvos.has(norm)) phoneToConvos.set(norm, []);
            phoneToConvos.get(norm)!.push(c);
        }

        let shopifyOrders: any[] = [];
        if (convoPhones.size > 0) {
            const dbStartDate = dateStart ? new Date(dateStart.getTime() - 48 * 60 * 60 * 1000).toISOString() : undefined;
            const dbEndDate = dateEnd ? new Date(dateEnd.getTime() + 48 * 60 * 60 * 1000).toISOString() : undefined;

            const whereClause: any = { brandId };
            if (dbStartDate && dbEndDate) {
                whereClause.createdAt = { gte: dbStartDate, lte: dbEndDate };
            }

            shopifyOrders = await prisma.shopifyOrder.findMany({
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
        }

        const ordersByPhone = new Map<string, any[]>();
        for (const order of shopifyOrders) {
            const norm = normalizePhone(order.phone || "");
            if (!norm || norm.length < 10) continue;
            if (!ordersByPhone.has(norm)) ordersByPhone.set(norm, []);
            ordersByPhone.get(norm)!.push(order);
        }

        const dailyStats: Record<string, { total: number; converted: number; revenue: number }> = {};
        const convoDetails: any[] = [];
        const usedOrderIds = new Set<string>();

        for (const c of filtered) {
            const norm = normalizePhone(c.phone_number || "");
            const msgDate = new Date(c.last_message_created);
            const day = msgDate.toISOString().split("T")[0];

            if (!dailyStats[day]) dailyStats[day] = { total: 0, converted: 0, revenue: 0 };
            dailyStats[day].total++;

            let matchedOrder: any = null;
            if (norm && ordersByPhone.has(norm)) {
                const orders = ordersByPhone.get(norm)!;
                let bestDiff = Infinity;
                for (const order of orders) {
                    if (usedOrderIds.has(order.shopifyOrderId)) continue;
                    const orderDate = new Date(order.createdAt);
                    const diffMs = orderDate.getTime() - msgDate.getTime();
                    if (diffMs >= -6 * 60 * 60 * 1000 && diffMs <= 48 * 60 * 60 * 1000) {
                        const absDiff = Math.abs(diffMs);
                        if (absDiff < bestDiff) {
                            bestDiff = absDiff;
                            matchedOrder = order;
                        }
                    }
                }
            }

            const detail: any = {
                convoId: c.convo_id,
                phone: c.phone_number,
                name: c.name || "",
                date: day,
                lastMessage: c.last_message_created,
                converted: !!matchedOrder,
            };

            if (matchedOrder) {
                usedOrderIds.add(matchedOrder.shopifyOrderId);
                detail.orderName = matchedOrder.orderName;
                detail.orderNumber = matchedOrder.orderNumber;
                detail.orderAmount = matchedOrder.totalPrice;
                detail.orderDate = matchedOrder.createdAt;
                dailyStats[day].converted++;
                dailyStats[day].revenue += matchedOrder.totalPrice || 0;
            }

            convoDetails.push(detail);
        }

        const sortedDays = Object.entries(dailyStats)
            .map(([date, stats]) => ({
                date,
                total: stats.total,
                converted: stats.converted,
                conversionRate: stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0,
                revenue: stats.revenue,
            }))
            .sort((a, b) => b.date.localeCompare(a.date));

        const totals = {
            totalConversations: filtered.length,
            totalConverted: convoDetails.filter(d => d.converted).length,
            conversionRate: filtered.length > 0 ? Math.round((convoDetails.filter(d => d.converted).length / filtered.length) * 100) : 0,
            totalRevenue: convoDetails.filter(d => d.converted).reduce((s, d) => s + (d.orderAmount || 0), 0),
        };

        const phoneToOrder = new Map<string, { orderName: string; orderNumber: string }>();
        for (const d of convoDetails) {
            if (d.converted) {
                phoneToOrder.set(d.convoId, { orderName: d.orderName, orderNumber: d.orderNumber });
            }
        }

        return NextResponse.json({
            totals,
            dailyStats: sortedDays,
            conversations: convoDetails,
            orderMap: Object.fromEntries(phoneToOrder),
        });
    } catch (err: any) {
        console.error("WhatsApp analytics error:", err);
        return NextResponse.json({ error: err.message || "Failed to compute analytics" }, { status: 500 });
    }
}
