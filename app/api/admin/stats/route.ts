import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const [
            totalOrders,
            postexOrders,
            tranzoOrders,
            totalBrands,
            brands,
            recentOrders,
            statusCounts,
        ] = await Promise.all([
            prisma.order.count(),
            prisma.order.count({ where: { courier: "PostEx" } }),
            prisma.order.count({ where: { courier: "Tranzo" } }),
            prisma.brand.count(),
            prisma.brand.findMany({
                select: { id: true, name: true, createdAt: true },
                orderBy: { createdAt: "desc" },
            }),
            prisma.order.findMany({
                select: { trackingNumber: true, courier: true, orderStatus: true, orderDate: true, customerName: true, orderAmount: true, brandId: true },
                orderBy: { lastFetchedAt: "desc" },
                take: 10,
            }),
            prisma.order.groupBy({
                by: ["orderStatus"],
                _count: { orderStatus: true },
                orderBy: { _count: { orderStatus: "desc" } },
                take: 10,
            }),
        ]);

        const brandOrderCounts = await prisma.order.groupBy({
            by: ["brandId", "courier"],
            _count: { trackingNumber: true },
        });

        return NextResponse.json({
            totalOrders,
            postexOrders,
            tranzoOrders,
            totalBrands,
            brands,
            recentOrders,
            statusCounts: statusCounts.map(s => ({ status: s.orderStatus, count: s._count.orderStatus })),
            brandOrderCounts: brandOrderCounts.map(b => ({ brandId: b.brandId, courier: b.courier, count: b._count.trackingNumber })),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
