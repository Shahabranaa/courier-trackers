import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const brandId = req.headers.get("brand-id");
    if (!brandId) {
        return NextResponse.json({ error: "brand-id header required" }, { status: 400 });
    }

    const body = await req.json();
    const { customerName, phone, shippingAddress, shippingCity, lineItems, notes, deliveryFee } = body;

    if (!customerName || !phone) {
        return NextResponse.json({ error: "Customer name and phone are required" }, { status: 400 });
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
                notes: notes || "WhatsApp order",
                deliveryFee: deliveryFee ?? 190,
            }),
        });

        const data = await createRes.json();

        if (!createRes.ok) {
            return NextResponse.json({ error: data.error || "Failed to create Shopify order" }, { status: createRes.status });
        }

        return NextResponse.json({ success: true, order: data.order });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to create order" }, { status: 500 });
    }
}
