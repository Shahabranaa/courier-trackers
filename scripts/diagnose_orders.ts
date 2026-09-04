
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const start = "2026-01-01T00:00:00.000Z";
    const end = "2026-01-31T23:59:59.999Z";

    // 1. Total Count by Date Range
    const total = await prisma.order.count({
        where: {
            courier: "PostEx",
            orderDate: { gte: start, lte: end }
        }
    });

    // 2. Breakdown by Brand
    const byBrand = await prisma.order.groupBy({
        by: ['brandId'],
        where: {
            courier: "PostEx",
            orderDate: { gte: start, lte: end }
        },
        _count: { id: true }
    });

    // 3. Breakdown by Status (Live & Transaction)
    const byStatus = await prisma.order.groupBy({
        by: ['transactionStatus'],
        where: {
            courier: "PostEx",
            orderDate: { gte: start, lte: end }
        },
        _count: { id: true }
    });

    // 4. Check for Suspicious Duplicates (Same Tracking #)
    // Prisma `groupBy` doesn't support HAVING count > 1 easily without raw query, so we'll do a quick check on total vs unique tracking numbers.
    const uniqueTracking = await prisma.order.findMany({
        where: {
            courier: "PostEx",
            orderDate: { gte: start, lte: end }
        },
        select: { trackingNumber: true },
        distinct: ['trackingNumber']
    });

    console.log("--- DIAGNOSTIC REPORT ---");
    console.log(`Total DB Rows (Jan): ${total}`);
    console.log(`Unique Tracking Numbers: ${uniqueTracking.length}`);
    console.log("-------------------------");
    console.log("By Brand:", byBrand);
    console.log("-------------------------");
    console.log("By Status:", byStatus);
    console.log("-------------------------");

    if (total !== uniqueTracking.length) {
        console.log("WARNING: DUPLICATE TRACKING NUMBERS DETECTED!");
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
