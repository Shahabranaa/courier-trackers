
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const brandId = "brand_1770078444252";

    console.log("=== INVESTIGATING 2423 vs 2117 ===\n");

    // Get all January orders for this brand
    const janOrders = await prisma.order.findMany({
        where: {
            brandId: brandId,
            orderDate: {
                gte: "2026-01-01",
                lte: "2026-01-31T23:59:59.999Z"
            }
        },
        select: {
            trackingNumber: true,
            orderDate: true,
            transactionDate: true,
            courier: true
        }
    });

    console.log(`Total Jan orders by orderDate: ${janOrders.length}`);

    // Breakdown by transactionDate month
    const tdMonths: Record<string, number> = {};
    janOrders.forEach((o: any) => {
        const m = o.transactionDate ? o.transactionDate.substring(0, 7) : "NULL";
        tdMonths[m] = (tdMonths[m] || 0) + 1;
    });

    console.log("\nBreakdown of these orders by transactionDate month:");
    Object.entries(tdMonths).sort().forEach(([m, c]) => console.log(`  ${m}: ${c}`));

    // Check if there are Tranzo orders mixed in
    const couriers: Record<string, number> = {};
    janOrders.forEach((o: any) => {
        couriers[o.courier] = (couriers[o.courier] || 0) + 1;
    });

    console.log("\nBreakdown by courier:");
    Object.entries(couriers).forEach(([c, n]) => console.log(`  ${c}: ${n}`));

    // The mystery: where do the extra 306 orders come from?
    // 2423 - 2117 = 306 extra orders

    // Check if there are orders with orderDate in Jan but transactionDate in Dec or Feb
    const wrongMonth = janOrders.filter((o: any) => {
        const tdMonth = o.transactionDate ? o.transactionDate.substring(0, 7) : "NULL";
        return tdMonth !== "2026-01";
    });

    console.log(`\nOrders with orderDate in Jan but transactionDate NOT in Jan: ${wrongMonth.length}`);
    if (wrongMonth.length > 0 && wrongMonth.length <= 10) {
        wrongMonth.forEach((o: any) => {
            console.log(`  ${o.trackingNumber}: OD=${o.orderDate}, TD=${o.transactionDate}`);
        });
    }

    console.log("\n=== END ===");
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
