import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id") || "";

    if (!brandId) {
        return NextResponse.json({ error: "Missing brand ID" }, { status: 400 });
    }

    try {
        const allOrders = await prisma.order.findMany({
            where: { brandId },
            select: {
                trackingNumber: true,
                courier: true,
                orderDate: true,
                invoicePayment: true,
                orderAmount: true,
                transactionFee: true,
                transactionTax: true,
                salesWithholdingTax: true,
                upfrontPayment: true,
                netAmount: true,
                transactionStatus: true,
                orderStatus: true,
                lastStatus: true,
            }
        });

        const shopifyOrders = await prisma.shopifyOrder.findMany({
            where: { brandId },
            select: {
                totalPrice: true,
                createdAt: true,
                financialStatus: true,
            }
        });

        const postexOrders = allOrders.filter(o => o.courier === "PostEx");
        const tranzoOrders = allOrders.filter(o => o.courier === "Tranzo");
        const tcsOrders = allOrders.filter(o => o.courier === "TCS");
        const leopardsOrders = allOrders.filter(o => o.courier === "Leopards");
        const tcsPaymentRows = tcsOrders.length ? await prisma.paymentStatus.findMany({
            where: { trackingNumber: { in: tcsOrders.map((order) => order.trackingNumber) } },
            select: { data: true },
        }) : [];
        const tcsPayments = tcsPaymentRows.flatMap((row) => {
            try {
                const payment = JSON.parse(row.data);
                if (!payment?.paid) return [];
                const date = String(payment.paymentDate || payment.deliveryDate || payment.bookingDate || "");
                const parsed = new Date(date);
                const month = Number.isNaN(parsed.getTime())
                    ? "Unknown"
                    : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
                return [{ amount: Number(payment.amountPaid || 0), month }];
            } catch {
                return [];
            }
        });

        const isDelivered = (o: any) => {
            const s = (o.transactionStatus || "").toLowerCase();
            const os = (o.orderStatus || "").toLowerCase();
            const ls = (o.lastStatus || "").toLowerCase();
            if (o.courier === "TCS" && ["ok", "delivered", "transferred", "payment transferred"].includes(s)) return true;
            return [s, os, ls].some((value) => (value.includes("deliver") && !value.includes("not delivered") && !value.includes("undelivered")) || value.includes("completed")) || s.includes("transferred");
        };

        const isReturn = (o: any) => {
            const s = (o.transactionStatus || "").toLowerCase();
            const os = (o.orderStatus || "").toLowerCase();
            const ls = (o.lastStatus || "").toLowerCase();
            if (o.courier === "TCS" && ["rs", "ro"].includes(s)) return true;
            return [s, os, ls].some((value) => value.includes("return") || value === "rto" || value === "ro" || value === "rs");
        };

        const groupByMonth = (orders: any[]) => {
            const months: Record<string, any> = {};
            for (const o of orders) {
                const dateStr = o.orderDate || "";
                let monthKey = "Unknown";
                if (dateStr) {
                    try {
                        const d = new Date(dateStr);
                        if (!isNaN(d.getTime())) {
                            monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                        }
                    } catch {}
                }

                if (!months[monthKey]) {
                    months[monthKey] = {
                        month: monthKey,
                        totalOrders: 0,
                        deliveredOrders: 0,
                        returnedOrders: 0,
                        grossAmount: 0,
                        fees: 0,
                        taxes: 0,
                        withholdingTax: 0,
                        upfrontPayments: 0,
                        netAmount: 0,
                        days: {} as Record<string, any>,
                    };
                }

                const m = months[monthKey];
                m.totalOrders++;
                const delivered = isDelivered(o);
                const returned = isReturn(o);
                if (delivered) m.deliveredOrders++;
                if (returned) m.returnedOrders++;
                m.grossAmount += o.invoicePayment || 0;
                m.fees += o.transactionFee || 0;
                m.taxes += o.transactionTax || 0;
                m.withholdingTax += o.salesWithholdingTax || 0;
                m.upfrontPayments += o.upfrontPayment || 0;
                if (delivered) {
                    m.netAmount += o.netAmount || 0;
                } else if (returned) {
                    m.netAmount -= o.transactionFee || 0;
                }

                let dayKey = dateStr;
                try {
                    const d = new Date(dateStr);
                    if (!isNaN(d.getTime())) {
                        dayKey = d.toISOString().slice(0, 10);
                    }
                } catch {}

                if (!m.days[dayKey]) {
                    m.days[dayKey] = {
                        date: dayKey,
                        totalOrders: 0,
                        deliveredOrders: 0,
                        returnedOrders: 0,
                        grossAmount: 0,
                        fees: 0,
                        taxes: 0,
                        withholdingTax: 0,
                        upfrontPayments: 0,
                        netAmount: 0,
                    };
                }
                const day = m.days[dayKey];
                day.totalOrders++;
                if (delivered) day.deliveredOrders++;
                if (returned) day.returnedOrders++;
                day.grossAmount += o.invoicePayment || 0;
                day.fees += o.transactionFee || 0;
                day.taxes += o.transactionTax || 0;
                day.withholdingTax += o.salesWithholdingTax || 0;
                day.upfrontPayments += o.upfrontPayment || 0;
                if (delivered) {
                    day.netAmount += o.netAmount || 0;
                } else if (returned) {
                    day.netAmount -= o.transactionFee || 0;
                }
            }

            return Object.values(months)
                .map((m: any) => ({
                    ...m,
                    days: Object.values(m.days).sort((a: any, b: any) => b.date.localeCompare(a.date)),
                }))
                .sort((a: any, b: any) => b.month.localeCompare(a.month));
        };

        const postexMonthly = groupByMonth(postexOrders);
        const tranzoMonthly = groupByMonth(tranzoOrders);
        const tcsMonthly = groupByMonth(tcsOrders);
        const leopardsMonthly = groupByMonth(leopardsOrders);

        const postexTotals = {
            totalOrders: postexOrders.length,
            deliveredOrders: postexOrders.filter(isDelivered).length,
            returnedOrders: postexOrders.filter(isReturn).length,
            grossAmount: postexOrders.reduce((s, o) => s + (o.invoicePayment || 0), 0),
            fees: postexOrders.reduce((s, o) => s + (o.transactionFee || 0), 0),
            taxes: postexOrders.reduce((s, o) => s + (o.transactionTax || 0), 0),
            withholdingTax: postexOrders.reduce((s, o) => s + (o.salesWithholdingTax || 0), 0),
            upfrontPayments: postexOrders.reduce((s, o) => s + (o.upfrontPayment || 0), 0),
            netAmount: postexOrders.reduce((s, o) => s + (o.netAmount || 0), 0),
        };

        const tranzoTotals = {
            totalOrders: tranzoOrders.length,
            deliveredOrders: tranzoOrders.filter(isDelivered).length,
            returnedOrders: tranzoOrders.filter(isReturn).length,
            grossAmount: tranzoOrders.reduce((s, o) => s + (o.invoicePayment || 0), 0),
            fees: tranzoOrders.reduce((s, o) => s + (o.transactionFee || 0), 0),
            taxes: tranzoOrders.reduce((s, o) => s + (o.transactionTax || 0), 0),
            withholdingTax: 0,
            upfrontPayments: 0,
            netAmount: tranzoOrders.reduce((s, o) => {
                if (isDelivered(o)) return s + (o.netAmount || 0);
                if (isReturn(o)) return s - (o.transactionFee || 0);
                return s;
            }, 0),
        };
        const tcsTotals = {
            totalOrders: tcsOrders.length,
            deliveredOrders: tcsOrders.filter(isDelivered).length,
            returnedOrders: tcsOrders.filter(isReturn).length,
            grossAmount: tcsOrders.reduce((s, o) => s + (o.invoicePayment || o.orderAmount || 0), 0),
            fees: tcsOrders.reduce((s, o) => s + (o.transactionFee || 0), 0),
            taxes: tcsOrders.reduce((s, o) => s + (o.transactionTax || 0), 0),
            withholdingTax: tcsOrders.reduce((s, o) => s + (o.salesWithholdingTax || 0), 0),
            upfrontPayments: 0,
            netAmount: tcsOrders.reduce((s, o) => {
                if (isDelivered(o)) return s + (o.netAmount || 0);
                if (isReturn(o)) return s - (o.transactionFee || 0);
                return s;
            }, 0),
        };
        const leopardsTotals = {
            totalOrders: leopardsOrders.length,
            deliveredOrders: leopardsOrders.filter(isDelivered).length,
            returnedOrders: leopardsOrders.filter(isReturn).length,
            grossAmount: leopardsOrders.reduce((s, o) => s + (o.invoicePayment || o.orderAmount || 0), 0),
            fees: leopardsOrders.reduce((s, o) => s + (o.transactionFee || 0), 0),
            taxes: leopardsOrders.reduce((s, o) => s + (o.transactionTax || 0), 0),
            withholdingTax: leopardsOrders.reduce((s, o) => s + (o.salesWithholdingTax || 0), 0),
            upfrontPayments: 0,
            netAmount: leopardsOrders.reduce((s, o) => {
                if (isDelivered(o)) return s + (o.netAmount || o.orderAmount || o.invoicePayment || 0);
                if (isReturn(o)) return s - (o.transactionFee || 0);
                return s;
            }, 0),
        };

        const shopifyRevenue = shopifyOrders.reduce((s, o) => s + (o.totalPrice || 0), 0);
        const shopifyOrderCount = shopifyOrders.length;

        const shopifyMonthly: Record<string, { month: string; revenue: number; orders: number }> = {};
        for (const o of shopifyOrders) {
            let monthKey = "Unknown";
            try {
                const d = new Date(o.createdAt);
                if (!isNaN(d.getTime())) {
                    monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                }
            } catch {}
            if (!shopifyMonthly[monthKey]) {
                shopifyMonthly[monthKey] = { month: monthKey, revenue: 0, orders: 0 };
            }
            shopifyMonthly[monthKey].revenue += o.totalPrice || 0;
            shopifyMonthly[monthKey].orders++;
        }

        return NextResponse.json({
            postex: {
                totals: postexTotals,
                monthly: postexMonthly,
            },
            tranzo: {
                totals: tranzoTotals,
                monthly: tranzoMonthly,
            },
            tcs: {
                totals: tcsTotals,
                monthly: tcsMonthly,
                paymentsReceived: {
                    total: tcsPayments.reduce((sum, payment) => sum + payment.amount, 0),
                    monthly: Object.entries(tcsPayments.reduce((months, payment) => {
                        months[payment.month] = (months[payment.month] || 0) + payment.amount;
                        return months;
                    }, {} as Record<string, number>)).map(([month, amount]) => ({ month, amount })),
                },
            },
            leopards: {
                totals: leopardsTotals,
                monthly: leopardsMonthly,
            },
            shopify: {
                totalRevenue: shopifyRevenue,
                totalOrders: shopifyOrderCount,
                monthly: Object.values(shopifyMonthly).sort((a: any, b: any) => b.month.localeCompare(a.month)),
            }
        });
    } catch (error: any) {
        console.error("Finance API error:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
