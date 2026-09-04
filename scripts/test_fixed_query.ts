
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Simulate what the FIXED API query does for January 2026
async function main() {
    const brandId = "brand_1770078444252";
    const startQuery = "2026-01-01";
    const endQuery = "2026-01-31T23:59:59.999Z";

    console.log("=== SIMULATING FIXED API QUERY ===");
    console.log(`Brand: ${brandId}`);
    console.log(`Query: courier = "PostEx" AND orderDate >= "${startQuery}" AND orderDate <= "${endQuery}"`);

    const orders = await prisma.order.findMany({
        where: {
            brandId: brandId,
            courier: "PostEx", // THE FIX
            AND: [
                { orderDate: { gte: startQuery } },
                { orderDate: { lte: endQuery } }
            ]
        },
        select: { trackingNumber: true }
    });

    console.log(`\nResult: ${orders.length} orders returned`);
    console.log(`Expected: 2117`);
    console.log(`Match: ${orders.length === 2117 ? "✅ YES" : "❌ NO"}`);

    console.log("\n=== END ===");
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
