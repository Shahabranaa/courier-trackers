import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header required" }, { status: 400 });
    }

    const body = await req.json();
    const { messageId, customerName, phone, shippingAddress, shippingCity, lineItems, notes, deliveryFee } = body;

    if (!messageId) {
        return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }

    const message = await prisma.whatsAppMessage.findFirst({ where: { id: messageId, brandId } });
    if (!message) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (message.orderCreated) {
        return NextResponse.json({ error: "Order already created from this message" }, { status: 400 });
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) {
        return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }

    try {
        const createRes = await fetch(new URL("/api/shopify/orders/create", req.url).toString(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "brand-id": brandId,
                "cookie": req.headers.get("cookie") || "",
            },
            body: JSON.stringify({
                customerName: customerName || "",
                phone: phone || "",
                shippingAddress: shippingAddress || "",
                shippingCity: shippingCity || "",
                lineItems: lineItems || [{ title: "WhatsApp Order", quantity: 1, price: 0 }],
                notes: notes || `WhatsApp order from ${message.senderName || message.senderPhone}`,
                deliveryFee: deliveryFee ?? 190,
            }),
        });

        const data = await createRes.json();

        if (!createRes.ok) {
            return NextResponse.json({ error: data.error || "Failed to create Shopify order" }, { status: createRes.status });
        }

        await prisma.whatsAppMessage.update({
            where: { id: messageId },
            data: {
                orderCreated: true,
                shopifyOrderId: data.order?.shopifyOrderId || "",
            },
        });

        return NextResponse.json({ success: true, order: data.order });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to create order" }, { status: 500 });
    }
}
