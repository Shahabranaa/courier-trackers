import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    const token = req.headers.get("token");
    if (!token) {
        return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { trackingNumbers } = body;

        if (!trackingNumbers || !Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
            return NextResponse.json({ error: "Invalid trackingNumbers array" }, { status: 400 });
        }

        // PostEx API expects: { "trackingNumber": ["T1", "T2"] }
        const payload = {
            trackingNumber: trackingNumbers
        };

        const response = await fetch("https://api.postex.pk/services/integration/api/order/v1/track-bulk-order", {
            method: "POST",
            headers: {
                "token": token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: "PostEx Bulk Track Failed", details: errorText }, { status: response.status });
        }

        const data = await response.json();
        // PostEx returns { "dist": [ { ...trackingStatus... } ] } usually? Or directly array?
        // Let's assume standard "dist" wrapper pattern or direct array.
        // If dist exists, use it. Else assume data itself.
        const statuses = data.dist || data;

        if (Array.isArray(statuses)) {
            // Cache results to DB in a transaction
            // We use upsert for each item
            // Use Promise.all or transaction? Transaction for batch is safer but slower if huge.
            // Chunking not strictly needed for small batches (e.g. 50), but good practice.

            // Map response to our schema and save
            // Note: Depending on response structure, we need to map fields.
            // Assuming response structure matches single tracking response somewhat.

            await prisma.$transaction(
                statuses.map((status: any) => {
                    // Check if status has trackingNumber
                    const tNo = status.trackingNumber;
                    if (!tNo) return null; // Skip invalid

                    return prisma.trackingStatus.upsert({
                        where: { trackingNumber: tNo },
                        update: {
                            data: JSON.stringify(status),
                            updatedAt: new Date()
                        },
                        create: {
                            trackingNumber: tNo,
                            data: JSON.stringify(status)
                        }
                    });
                }).filter(Boolean) as any[]
            );
        }

        return NextResponse.json(statuses);

    } catch (error: any) {
        console.error("Bulk Tracking Error:", error);
        return NextResponse.json({ error: "Internal Server Error", message: error.message }, { status: 500 });
    }
}
