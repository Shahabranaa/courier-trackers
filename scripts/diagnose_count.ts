
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const brandId = "brand_1770078444252"; // Organic Tea Co (from earlier diagnosis)

    // Check January by orderDate
    const janByOrderDate = await prisma.order.count({
        where: {
            brandId: brandId,
            courier: "PostEx",
            orderDate: {
                gte: "2026-01-01T00:00:00.000Z",
                lte: "2026-01-31T23:59:59.999Z"
            }
        }
    });

    // Check January by transactionDate
    const janByTransactionDate = await prisma.order.count({
        where: {
            brandId: brandId,
            courier: "PostEx",
            transactionDate: {
                gte: "2026-01-01T00:00:00.000Z",
                lte: "2026-01-31T23:59:59.999Z"
            }
        }
    });

    // Check ALL PostEx orders for this brand (no date filter)
    const allOrders = await prisma.order.count({
        where: {
            brandId: brandId,
            courier: "PostEx"
        }
    });

    // Check orders in Feb (to see if they're bleeding in)
    const febByOrderDate = await prisma.order.count({
        where: {
            brandId: brandId,
            courier: "PostEx",
            orderDate: {
                gte: "2026-02-01T00:00:00.000Z",
                lte: "2026-02-04T23:59:59.999Z"
            }
        }
    });

    console.log("--- ORDER COUNT DIAGNOSIS ---");
    console.log(`Brand: ${brandId}`);
    console.log(`All PostEx Orders (Total): ${allOrders}`);
    console.log(`January by orderDate: ${janByOrderDate}`);
    console.log(`January by transactionDate: ${janByTransactionDate}`);
    console.log(`February by orderDate (1-4): ${febByOrderDate}`);
    console.log("-----------------------------");
    console.log(`Expected: 2117 | Discrepancy Check: ${janByOrderDate - 2117}`);
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
