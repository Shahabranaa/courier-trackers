import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const brandId = req.headers.get("brand-id");

    if (!brandId) {
        return NextResponse.json({ error: "Missing brand-id header" }, { status: 400 });
    }

    try {
        // Calculate cut-off date (5 days ago)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 5);
        const cutoffIso = cutoffDate.toISOString();
        // We compare ISO strings. "2026-02-04" is <= "2026-02-09"

        const orders = await prisma.order.findMany({
            where: {
                brandId: brandId,
                courier: "PostEx",
                orderDate: {
                    lte: cutoffIso
                },
                // Exclude completed statuses
                // using NOT OR for cleaner logic
                NOT: [
                    { transactionStatus: { contains: "Delivered", mode: 'insensitive' } },
                    { transactionStatus: { contains: "Return", mode: 'insensitive' } }, // Covers Returned, Return Verified, Return to Shipper
                    { transactionStatus: { contains: "Cancel", mode: 'insensitive' } },
                    { transactionStatus: { contains: "Transferred", mode: 'insensitive' } } // Payment Transferred = Delivered usually
                ]
            },
            include: {
                trackingStatus: true,
                paymentStatus: true
            },
            orderBy: {
                orderDate: 'asc' // Oldest critical orders first
            }
        });

        return NextResponse.json({
            count: orders.length,
            orders
        });

    } catch (error: any) {
        console.error("Critical Orders API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
