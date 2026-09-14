import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

function isZoomDelivered(status: string): boolean {
    const s = (status || "").toLowerCase();
    return s.includes("delivered") && !s.includes("un delivered") && !s.includes("undelivered") && !s.includes("not delivered");
}

export async function POST(req: NextRequest) {
    const user = await getAuthUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header is required" }, { status: 400 });
    }

    try {
        const orders = await prisma.order.findMany({
            where: { brandId, courier: "Zoom" },
            select: { trackingNumber: true, orderAmount: true, transactionStatus: true, transactionFee: true, netAmount: true },
        });

        let updated = 0;
        let failed = 0;
        const batchSize = 50;

        for (let i = 0; i < orders.length; i += batchSize) {
            const batch = orders.slice(i, i + batchSize);
            const updates = batch.map(order => {
                const delivered = isZoomDelivered(order.transactionStatus || "");
            const correctNet = delivered
                ? (order.orderAmount || 0) - (order.transactionFee || 0)
                : (order.transactionStatus || "").toLowerCase().includes("return")
                    ? -(order.transactionFee || 0)
                    : 0;

                if (Math.abs((order.netAmount || 0) - correctNet) < 0.01) return null;

                return { trackingNumber: order.trackingNumber, correctNet };
            }).filter(Boolean) as { trackingNumber: string; correctNet: number }[];

            if (updates.length > 0) {
                const results = await Promise.allSettled(
                    updates.map(u =>
                        prisma.order.update({
                            where: { trackingNumber: u.trackingNumber },
                            data: {
                                netAmount: u.correctNet,
                            },
                        })
                    )
                );
                results.forEach(r => {
                    if (r.status === "fulfilled") updated++;
                    else failed++;
                });
            }
        }

        return NextResponse.json({
            success: true,
            total: orders.length,
            updated,
            failed,
            unchanged: orders.length - updated - failed,
        });
    } catch (error: any) {
        console.error("Zoom recalculate error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
