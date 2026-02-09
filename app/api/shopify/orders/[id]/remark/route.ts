import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const brandId = request.headers.get("brand-id");

        if (!brandId) {
            return NextResponse.json({ error: "Brand ID required" }, { status: 400 });
        }

        const body = await request.json();
        const { remark } = body;

        if (typeof remark !== "string") {
            return NextResponse.json({ error: "Remark must be a string" }, { status: 400 });
        }

        const order = await prisma.shopifyOrder.findUnique({
            where: { shopifyOrderId: id },
            select: { brandId: true }
        });

        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        if (order.brandId !== brandId) {
            return NextResponse.json({ error: "Not authorized to update this order" }, { status: 403 });
        }

        const updated = await prisma.shopifyOrder.update({
            where: { shopifyOrderId: id },
            data: { pendingRemark: remark }
        });

        return NextResponse.json({ success: true, pendingRemark: updated.pendingRemark });
    } catch (error: any) {
        console.error("Failed to update remark:", error);
        return NextResponse.json({ error: "Failed to save remark" }, { status: 500 });
    }
}
