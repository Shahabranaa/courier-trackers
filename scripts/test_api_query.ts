
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simulate what the API query does for January 2026
async function main() {
    const brandId = "brand_1770078444252"; // Main brand
    const startQuery = "2026-01-01";
    const endQuery = "2026-01-31T23:59:59.999Z";

    console.log("=== SIMULATING API QUERY ===");
    console.log(`Brand: ${brandId}`);
    console.log(`Query: orderDate >= "${startQuery}" AND orderDate <= "${endQuery}"`);

    const orders = await prisma.order.findMany({
        where: {
            brandId: brandId,
            AND: [
                { orderDate: { gte: startQuery } },
                { orderDate: { lte: endQuery } }
            ]
        },
        select: { trackingNumber: true, orderDate: true }
    });

    console.log(`\nResult: ${orders.length} orders returned`);

    if (orders.length > 0) {
        console.log("\nFirst 5 orderDates:");
        orders.slice(0, 5).forEach((o: any) => console.log(`  ${o.orderDate}`));
        console.log("\nLast 5 orderDates:");
        orders.slice(-5).forEach((o: any) => console.log(`  ${o.orderDate}`));
    }

    console.log("\n=== END ===");
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
