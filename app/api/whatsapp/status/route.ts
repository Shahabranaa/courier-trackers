import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await prisma.whatsAppSession.findFirst({
        where: { id: "default" },
    });

    if (!session) {
        return NextResponse.json({
            status: "not_configured",
            phone: "",
            qrCode: "",
            lastConnected: null,
        });
    }

    return NextResponse.json({
        status: session.status,
        phone: session.phone,
        qrCode: session.status === "qr_pending" ? session.qrCode : "",
        lastConnected: session.lastConnected,
    });
}
