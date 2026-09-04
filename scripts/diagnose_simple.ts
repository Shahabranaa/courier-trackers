
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const start = "2026-01-01T00:00:00.000Z";
    const end = "2026-01-31T23:59:59.999Z";

    // 1. Total Count (PostEx)
    try {
        const total = await prisma.order.count({
            where: {
                courier: "PostEx",
                orderDate: { gte: start, lte: end }
            }
        });
        console.log(`Total PostEx Orders (Jan): ${total}`);
    } catch (e) { console.error("Total Count failed", e); }

    // 2. Count by Distinct Tracking (to check duplicates)
    try {
        const unique = await prisma.order.findMany({
            where: { courier: "PostEx", orderDate: { gte: start, lte: end } },
            distinct: ['trackingNumber'],
            select: { id: true }
        });
        console.log(`Unique Tracking Numbers: ${unique.length}`);
    } catch (e) { console.error("Distinct Count failed", e); }

    // 3. Count by Brand (Simulated GroupBy)
    // Since we don't know brand IDs, let's just count 'default' vs others
    // Or fetch all and tally manually if small enough, but let's try raw count
    try {
        const distinctBrands = await prisma.order.findMany({
            where: { courier: "PostEx", orderDate: { gte: start, lte: end } },
            distinct: ['brandId'],
            select: { brandId: true }
        });

        for (const b of distinctBrands) {
            const count = await prisma.order.count({
                where: {
                    courier: "PostEx",
                    orderDate: { gte: start, lte: end },
                    brandId: b.brandId
                }
            });
            console.log(`Brand [${b.brandId}]: ${count}`);
        }
    } catch (e) { console.error("Brand tally failed", e); }

    // 4. Check 'Delivered' count (maybe that's what user means?)
    try {
        const delivered = await prisma.order.count({
            where: {
                courier: "PostEx",
                orderDate: { gte: start, lte: end },
                OR: [
                    { orderStatus: { contains: "Delivered" } },
                    { transactionStatus: { contains: "Delivered" } },
                    { transactionStatus: { contains: "Transferred" } }
                ]
            }
        });
        console.log(`Delivered/Transferred Orders: ${delivered}`);
    } catch (e) { console.error("Delivered count failed", e); }

}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
