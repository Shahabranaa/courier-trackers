import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    const token = req.headers.get("api-token");
    const brandId = req.headers.get("brand-id") || "default";
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const forceSync = searchParams.get("sync") === "true";

    if (!token) {
        return NextResponse.json({ error: "Missing api-token header" }, { status: 401 });
    }

    if (!forceSync) {
        try {
            const whereClause: any = {
                courier: "Tranzo",
                brandId: brandId
            };
            if (startDate || endDate) {
                whereClause.AND = [];
                if (startDate) whereClause.AND.push({ orderDate: { gte: startDate + "T00:00:00.000Z" } });
                if (endDate) whereClause.AND.push({ orderDate: { lte: endDate + "T23:59:59.999Z" } });
            }

            const localOrders = await prisma.order.findMany({
                where: whereClause,
                orderBy: { transactionDate: 'desc' }
            });

            console.log(`Served ${localOrders.length} Tranzo orders from DB for brand ${brandId}`);

            return NextResponse.json({
                source: "local",
                count: localOrders.length,
                results: localOrders
            });
        } catch (dbError: any) {
            console.error("DB read failed, attempting live fetch:", dbError.message);
        }
    }

    try {
        console.log(`Syncing Tranzo orders from API for Brand: ${brandId}...`);

        const now = new Date();
        let dateFrom = startDate;
        let dateTo = endDate;
        if (!dateFrom) {
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            dateFrom = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;
        }
        if (!dateTo) {
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
        }

        const targetUrl = `https://api-integration.tranzo.pk/api/custom/v1/get-order-logs/?date_from=${dateFrom}&date_to=${dateTo}`;
        console.log(`Calling Tranzo API: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: "GET",
            headers: {
                "api-token": token,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Tranzo API Error: ${response.status} ${await response.text()}`);
        }

        const data = await response.json();
        const results = Array.isArray(data) ? data : (data.results || data.data || data.orders || []);

        console.log(`Fetched ${results.length} live orders. Storing to DB...`);

        let detectedDateField = "";
        if (results.length > 0) {
            const sample = results[0] as any;
            const keys = Object.keys(sample);
            console.log(`[TRANZO DEBUG] Sample order keys: ${keys.join(", ")}`);

            const dateFieldCandidates = keys.filter(k => {
                const val = sample[k];
                if (typeof val !== "string" || !val) return false;
                return /^\d{4}-\d{2}-\d{2}/.test(val) || /^\d{2}\/\d{2}\/\d{4}/.test(val) || /^\d{2}-\d{2}-\d{4}/.test(val);
            });
            console.log(`[TRANZO DEBUG] Fields with date-like values: ${dateFieldCandidates.map(k => `${k}="${sample[k]}"`).join(", ")}`);

            const preferredFields = ["created_at", "booking_date", "order_date", "booked_at", "created_date", "date", "createdAt"];
            for (const pf of preferredFields) {
                if (dateFieldCandidates.includes(pf)) {
                    detectedDateField = pf;
                    break;
                }
            }
            if (!detectedDateField && dateFieldCandidates.length > 0) {
                detectedDateField = dateFieldCandidates[0];
            }
            if (detectedDateField) {
                console.log(`[TRANZO DEBUG] Using detected date field: "${detectedDateField}" = "${sample[detectedDateField]}"`);
            } else {
                console.warn(`[TRANZO DEBUG] No date field detected! Will use current timestamp as fallback.`);
            }
        }

        const incomingTrackingNumbers = (results as any[]).map((o: any) => o.tracking_number).filter(Boolean);
        const existingOrdersMap: Record<string, string> = {};
        if (incomingTrackingNumbers.length > 0) {
            const batchSize = 200;
            for (let i = 0; i < incomingTrackingNumbers.length; i += batchSize) {
                const batch = incomingTrackingNumbers.slice(i, i + batchSize);
                const existing = await prisma.order.findMany({
                    where: { trackingNumber: { in: batch }, brandId, courier: "Tranzo" },
                    select: { trackingNumber: true, transactionStatus: true },
                });
                existing.forEach((o) => {
                    existingOrdersMap[o.trackingNumber] = (o.transactionStatus || "").toLowerCase();
                });
            }
        }

        let savedCount = 0;
        let failedCount = 0;
        let firstError = "";

        if (results.length > 0) {
            const chunkSize = 10;
            for (let i = 0; i < results.length; i += chunkSize) {
                const chunk = results.slice(i, i + chunkSize);

                const settled = await Promise.allSettled(
                    chunk.map((order: any) => {
                        const bookingAmount = parseFloat(order.booking_amount || "0");
                        const deliveryFee = parseFloat(order.delivery_fee || "0");
                        const deliveryTax = parseFloat(order.delivery_tax || "0");
                        const deliveryFuelFee = parseFloat(order.delivery_fuel_fee || "0");
                        const cashHandlingFee = parseFloat(order.cash_handling_fee || "0");

                        const transactionFee = deliveryFee + deliveryFuelFee + cashHandlingFee;
                        const transactionTax = deliveryTax;
                        const netAmount = bookingAmount - deliveryFee - deliveryTax - deliveryFuelFee - cashHandlingFee;

                        const orderDate = (detectedDateField ? order[detectedDateField] : null) || order.created_at || order.booking_date || new Date().toISOString();

                        const updateData: any = {
                            brandId: brandId,
                            courier: "Tranzo",
                            orderRefNumber: order.reference_number || "",
                            invoicePayment: bookingAmount,
                            customerName: order.customer_name || "N/A",
                            customerPhone: order.customer_phone || "",
                            deliveryAddress: order.delivery_address || "",
                            cityName: order.destination_city || null,
                            orderDetail: order.order_details || "",
                            orderType: "COD",
                            orderAmount: bookingAmount,
                            orderStatus: order.order_status || "Unknown",
                            transactionStatus: order.order_status || "Unknown",
                            actualWeight: parseFloat(order.actual_weight || "0"),
                            transactionTax: transactionTax,
                            transactionFee: transactionFee,
                            upfrontPayment: 0,
                            salesWithholdingTax: 0,
                            netAmount: netAmount,
                            orderDate: orderDate,
                            transactionDate: orderDate,
                            lastFetchedAt: new Date()
                        };

                        return prisma.order.upsert({
                            where: { trackingNumber: order.tracking_number },
                            update: updateData,
                            create: {
                                trackingNumber: order.tracking_number,
                                ...updateData,
                            }
                        });
                    })
                );

                for (const result of settled) {
                    if (result.status === "fulfilled") {
                        savedCount++;
                    } else {
                        failedCount++;
                        if (!firstError) {
                            firstError = result.reason?.message || String(result.reason);
                        }
                    }
                }
            }
        }

        console.log(`[TRANZO DEBUG] DB save results: ${savedCount} saved, ${failedCount} failed`);
        if (firstError) {
            console.error(`[TRANZO DEBUG] First upsert error: ${firstError}`);
        }

        let newOrders = 0;
        let newDelivered = 0;
        let newReturned = 0;
        let statusChanged = 0;

        for (const order of results as any[]) {
            const tn = order.tracking_number;
            if (!tn) continue;
            const newStatus = (order.order_status || "Unknown").toLowerCase();
            const oldStatus = existingOrdersMap[tn];

            if (oldStatus === undefined) {
                newOrders++;
                if (newStatus.includes("deliver")) newDelivered++;
                if (newStatus.includes("return")) newReturned++;
            } else {
                if (oldStatus !== newStatus) {
                    statusChanged++;
                    if (!oldStatus.includes("deliver") && newStatus.includes("deliver")) newDelivered++;
                    if (!oldStatus.includes("return") && newStatus.includes("return")) newReturned++;
                }
            }
        }

        const sampleKeys = results.length > 0 ? Object.keys(results[0] as any) : [];
        const sampleDateValues: Record<string, string> = {};
        if (results.length > 0) {
            const s = results[0] as any;
            for (const k of sampleKeys) {
                if (typeof s[k] === "string" && s[k] && (/date|time|created|updated|booking/i.test(k) || /^\d{4}-\d{2}/.test(s[k]))) {
                    sampleDateValues[k] = s[k];
                }
            }
        }

        const syncSummary = {
            totalFetched: results.length,
            newOrders,
            newDelivered,
            newReturned,
            statusChanged,
            savedToDb: savedCount,
            failedToSave: failedCount,
            dateFieldUsed: detectedDateField || "fallback(now)",
            dbError: firstError || null,
            apiSampleKeys: sampleKeys.join(", "),
            apiDateFields: sampleDateValues,
        };

        const whereClause: any = {
            courier: "Tranzo",
            brandId: brandId
        };
        if (startDate || endDate) {
            whereClause.AND = [];
            if (startDate) whereClause.AND.push({ orderDate: { gte: startDate + "T00:00:00.000Z" } });
            if (endDate) whereClause.AND.push({ orderDate: { lte: endDate + "T23:59:59.999Z" } });
        }

        const freshOrders = await prisma.order.findMany({
            where: whereClause,
            orderBy: { transactionDate: 'desc' }
        });

        return NextResponse.json({
            source: "live",
            count: freshOrders.length,
            results: freshOrders,
            syncSummary,
        });

    } catch (error: any) {
        console.warn("Tranzo API Sync Failed:", error.message);

        try {
            const whereClause: any = {
                courier: "Tranzo",
                brandId: brandId
            };
            if (startDate || endDate) {
                whereClause.AND = [];
                if (startDate) whereClause.AND.push({ orderDate: { gte: startDate + "T00:00:00.000Z" } });
                if (endDate) whereClause.AND.push({ orderDate: { lte: endDate + "T23:59:59.999Z" } });
            }

            const localOrders = await prisma.order.findMany({
                where: whereClause,
                orderBy: { transactionDate: 'desc' }
            });

            console.log(`Sync failed, served ${localOrders.length} orders from DB for brand ${brandId}.`);

            return NextResponse.json({
                source: "local",
                count: localOrders.length,
                results: localOrders,
                error: error.message
            });

        } catch (dbError: any) {
            console.error("Local DB Access Failed:", dbError);
            return NextResponse.json({ error: "Service unavailable", source: "error" }, { status: 503 });
        }
    }
}
