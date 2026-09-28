import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpsProxyAgent } from "https-proxy-agent";
import { checkCourierEnabled } from "@/lib/courierAccess";

type ProgressUpdate = {
    phase: string;
    message: string;
    percent: number;
    processed?: number;
    total?: number;
};

type ProgressReporter = (update: ProgressUpdate) => void;

const noopProgress: ProgressReporter = () => undefined;

function isDeliveredStatus(order: any) {
    const status = `${order?.transactionStatus || ""} ${order?.orderStatus || ""} ${order?.status || ""}`.toLowerCase();
    return /delivered|transferred|payment transferred/.test(status)
        && !/not delivered|undelivered|un delivered/.test(status);
}

function getOrderStatus(order: any) {
    return order?.transactionStatus || order?.orderStatus || "";
}

async function loadCachedOrders(brandId: string, startQuery?: string, endQuery?: string) {
    const where: any = {
        brandId,
        courier: "PostEx",
    };
    if (startQuery) {
        where.AND = [
            { orderDate: { gte: startQuery } },
            { orderDate: { lte: endQuery } },
        ];
    }

    return prisma.order.findMany({
        where,
        include: {
            trackingStatus: true,
            paymentStatus: true,
        },
    });
}

function createProgressResponse(run: (report: ProgressReporter) => Promise<any>) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const report: ProgressReporter = (update) => {
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: "progress", ...update })}\n`));
            };

            try {
                const data = await run(report);
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: "complete", data })}\n`));
            } catch (error: any) {
                controller.enqueue(encoder.encode(`${JSON.stringify({
                    type: "error",
                    error: error instanceof Error ? error.message : "PostEx sync failed",
                })}\n`));
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}

export async function GET(req: NextRequest) {
    const token = req.headers.get("token");
    const brandId = req.headers.get("brand-id") || "default";
    const proxyUrl = req.headers.get("proxy-url");
    const { searchParams } = new URL(req.url);

    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const enabled = await checkCourierEnabled(brandId, "postex");
    if (!enabled) {
        return NextResponse.json({ error: "PostEx access is disabled for this brand." }, { status: 403 });
    }

    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate") || startDate;
    const forceRefresh = searchParams.get("force") === "true";
    const streamProgress = searchParams.get("progress") === "true";
    const skipDelivered = searchParams.get("skipDelivered") === "true";
    const hasDateFilter = !!startDate;
    const startQuery = startDate ? `${startDate}T00:00:00.000Z` : undefined;
    const endQuery = startDate ? `${endDate}T23:59:59.999Z` : undefined;

    if (!forceRefresh) {
        try {
            const cachedOrders = await loadCachedOrders(brandId, startQuery, endQuery);
            console.log(`Served ${cachedOrders.length} PostEx orders from DB for brand ${brandId}`);
            return NextResponse.json({
                dist: cachedOrders,
                source: "local",
                count: cachedOrders.length,
            });
        } catch (error: any) {
            return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load orders" }, { status: 500 });
        }
    }

    if (!startDate) {
        return NextResponse.json({ error: "Date range is required for syncing live data. Please select a month." }, { status: 400 });
    }

    const runSync = async (report: ProgressReporter = noopProgress) => {
        report({ phase: "starting", message: "Connecting to PostEx…", percent: 5 });

        try {
            if (proxyUrl) {
                console.log(`Using proxy: ${proxyUrl.replace(/:[^:@]+@/, ":***@")}`);
            }

            const apiUrl = new URL("https://api.postex.pk/services/integration/api/order/v1/get-all-order");
            apiUrl.searchParams.append("startDate", startDate);
            apiUrl.searchParams.append("endDate", endDate!);
            apiUrl.searchParams.append("orderStatusId", "0");

            const fetchOptions: RequestInit & { agent?: any } = {
                method: "GET",
                headers: { token },
            };
            if (proxyUrl) {
                fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
            }

            const response = await fetch(apiUrl.toString(), fetchOptions);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`PostEx API Error: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            const orders = Array.isArray(data.dist) ? data.dist : [];
            report({
                phase: "received",
                message: `Received ${orders.length.toLocaleString()} orders from PostEx`,
                percent: 20,
                total: orders.length,
                processed: 0,
            });

            const incomingTrackingNumbers: string[] = Array.from(new Set(
                orders
                    .map((order: any) => order.trackingNumber)
                    .filter((trackingNumber: any): trackingNumber is string => Boolean(trackingNumber)),
            ));
            const existingOrdersMap: Record<string, { status: string; lastStatusTime: Date | null }> = {};

            for (let i = 0; i < incomingTrackingNumbers.length; i += 500) {
                const batch = incomingTrackingNumbers.slice(i, i + 500);
                const existing = await prisma.order.findMany({
                    where: { trackingNumber: { in: batch }, brandId, courier: "PostEx" },
                    select: { trackingNumber: true, transactionStatus: true, orderStatus: true, lastStatusTime: true },
                });
                existing.forEach((order) => {
                    existingOrdersMap[order.trackingNumber] = {
                        status: getOrderStatus(order).toLowerCase(),
                        lastStatusTime: order.lastStatusTime,
                    };
                });
            }

            const ordersToPersist = skipDelivered
                ? orders.filter((order: any) => {
                    const existing = existingOrdersMap[order.trackingNumber];
                    return !existing || !isDeliveredStatus(existing) || !isDeliveredStatus(order);
                })
                : orders;

            const skippedDelivered = orders.length - ordersToPersist.length;
            report({
                phase: "preparing",
                message: skipDelivered
                    ? `Skipping ${skippedDelivered} already-delivered orders`
                    : "Preparing order updates",
                percent: 30,
                total: orders.length,
                processed: 0,
            });

            let persistedOrders = 0;
            const chunkSize = 25;
            for (let i = 0; i < ordersToPersist.length; i += chunkSize) {
                const chunk = ordersToPersist.slice(i, i + chunkSize);
                await Promise.allSettled(chunk.map((order: any) => {
                    const status = (order.transactionStatus || order.orderStatus || "").toLowerCase();
                    const isReturn = status.includes("return");
                    const isCancelled = status.includes("cancel");

                    const pay = Number(order.invoicePayment) || 0;
                    const salesWithholdingTax = isReturn ? 0 : pay * 0.04;
                    const taxVal = isReturn ? (Number(order.reversalTax) || 0) : (Number(order.transactionTax) || 0);
                    const feeVal = isReturn ? (Number(order.reversalFee) || 0) : (Number(order.transactionFee) || 0);

                    let netAmount = 0;
                    if (isCancelled) {
                        netAmount = 0;
                    } else if (isReturn) {
                        netAmount = -(taxVal + feeVal);
                    } else {
                        netAmount = pay - taxVal - feeVal - salesWithholdingTax;
                    }

                    const safeTransactionDate = order.transactionDate
                        ? new Date(order.transactionDate).toISOString()
                        : new Date().toISOString();
                    const safeOrderDate = order.orderDate
                        ? new Date(order.orderDate).toISOString()
                        : safeTransactionDate;
                    const updateData = {
                        brandId,
                        courier: "PostEx",
                        orderRefNumber: order.orderRefNumber,
                        invoicePayment: pay,
                        customerName: order.customerName,
                        customerPhone: order.customerPhone,
                        deliveryAddress: order.deliveryAddress,
                        cityName: order.cityName,
                        transactionDate: safeTransactionDate,
                        orderDetail: order.orderDetail,
                        orderType: order.orderType || "COD",
                        orderDate: safeOrderDate,
                        orderAmount: Number(order.orderAmount) || 0,
                        orderStatus: order.orderStatus || order.transactionStatus || "Unknown",
                        transactionStatus: order.transactionStatus,
                        transactionTax: taxVal,
                        transactionFee: feeVal,
                        upfrontPayment: Number(order.upfrontPayment) || 0,
                        salesWithholdingTax,
                        netAmount,
                        lastFetchedAt: new Date(),
                    };

                    return prisma.order.upsert({
                        where: { trackingNumber: order.trackingNumber },
                        update: updateData,
                        create: {
                            trackingNumber: order.trackingNumber,
                            ...updateData,
                        },
                    });
                }));
                persistedOrders += chunk.length;
                report({
                    phase: "saving",
                    message: `Saved ${persistedOrders.toLocaleString()} of ${ordersToPersist.length.toLocaleString()} order updates`,
                    percent: 35 + Math.round((persistedOrders / Math.max(ordersToPersist.length, 1)) * 35),
                    total: ordersToPersist.length,
                    processed: persistedOrders,
                });
            }

            const deliveredCandidateTrackingNumbers = ordersToPersist
                .filter((order: any) => isDeliveredStatus(order))
                .map((order: any) => order.trackingNumber)
                .filter(Boolean);
            let deliveryDateLookups = 0;

            if (deliveredCandidateTrackingNumbers.length > 0) {
                const deliveredCandidates = await prisma.order.findMany({
                    where: {
                        brandId,
                        courier: "PostEx",
                        trackingNumber: { in: deliveredCandidateTrackingNumbers },
                        lastStatusTime: null,
                    },
                    select: { trackingNumber: true },
                });

                deliveryDateLookups = deliveredCandidates.length;
                report({
                    phase: "delivery-dates",
                    message: deliveryDateLookups > 0
                        ? `Checking delivery dates for ${deliveryDateLookups} newly delivered orders`
                        : "No delivery-date lookups needed",
                    percent: 78,
                    total: deliveryDateLookups,
                    processed: 0,
                });

                const trackBatchSize = 20;
                for (let i = 0; i < deliveredCandidates.length; i += trackBatchSize) {
                    const batch = deliveredCandidates.slice(i, i + trackBatchSize);
                    await Promise.allSettled(batch.map(async (order) => {
                        try {
                            const trackUrl = `https://api.postex.pk/services/integration/api/order/v1/track-order/${order.trackingNumber}`;
                            const trackFetchOptions: RequestInit & { agent?: any } = {
                                method: "GET",
                                headers: { token },
                            };
                            if (proxyUrl) {
                                trackFetchOptions.agent = new HttpsProxyAgent(proxyUrl);
                            }
                            const trackRes = await fetch(trackUrl, trackFetchOptions);
                            if (!trackRes.ok) return;
                            const trackData = await trackRes.json();
                            const orderData = trackData.dist || trackData.data || trackData;
                            const deliveryDate = orderData.orderDeliveryDate ? new Date(orderData.orderDeliveryDate) : null;
                            if (deliveryDate && !isNaN(deliveryDate.getTime())) {
                                await prisma.order.update({
                                    where: { trackingNumber: order.trackingNumber },
                                    data: { lastStatusTime: deliveryDate },
                                });
                            }
                        } catch (trackError) {
                            console.warn(`Track-order failed for ${order.trackingNumber}:`, trackError instanceof Error ? trackError.message : trackError);
                        }
                    }));
                    report({
                        phase: "delivery-dates",
                        message: `Checked ${Math.min(i + batch.length, deliveredCandidates.length)} of ${deliveredCandidates.length} delivery dates`,
                        percent: 78 + Math.round(((i + batch.length) / Math.max(deliveredCandidates.length, 1)) * 12),
                        total: deliveredCandidates.length,
                        processed: i + batch.length,
                    });
                }
            }

            let newOrders = 0;
            let newDelivered = 0;
            let newReturned = 0;
            let statusChanged = 0;

            for (const order of orders as any[]) {
                const trackingNumber = order.trackingNumber;
                if (!trackingNumber) continue;
                const newStatus = getOrderStatus(order).toLowerCase();
                const oldStatus = existingOrdersMap[trackingNumber]?.status;

                if (oldStatus === undefined) {
                    newOrders++;
                    if (newStatus.includes("deliver")) newDelivered++;
                    if (newStatus.includes("return")) newReturned++;
                } else if (oldStatus !== newStatus) {
                    statusChanged++;
                    if (!oldStatus.includes("deliver") && newStatus.includes("deliver")) newDelivered++;
                    if (!oldStatus.includes("return") && newStatus.includes("return")) newReturned++;
                }
            }

            report({ phase: "loading", message: "Loading the updated order list", percent: 94 });
            const freshOrders = await loadCachedOrders(brandId, startQuery, endQuery);
            const syncSummary = {
                totalFetched: orders.length,
                newOrders,
                newDelivered,
                newReturned,
                statusChanged,
                persistedOrders,
                skippedDelivered,
                deliveryDateLookups,
            };

            report({ phase: "complete", message: `Sync complete: ${freshOrders.length.toLocaleString()} orders ready`, percent: 100 });
            return {
                dist: freshOrders,
                source: "live",
                count: freshOrders.length,
                syncSummary,
            };
        } catch (error: any) {
            console.warn("PostEx Live Fetch Failed, attempting Fallback to DB...", error.message);
            const cachedOrders = await loadCachedOrders(brandId, startQuery, endQuery);
            return {
                dist: cachedOrders,
                source: "local_fallback",
                error: error instanceof Error ? error.message : "PostEx live sync failed",
            };
        }
    };

    if (streamProgress) {
        return createProgressResponse(runSync);
    }

    try {
        return NextResponse.json(await runSync());
    } catch (error: any) {
        console.error("Internal API Error:", error);
        return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
    }
}