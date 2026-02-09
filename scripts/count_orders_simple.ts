
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const start = "2026-01-01T00:00:00.000Z";
    const end = "2026-01-31T23:59:59.999Z";

    try {
        const count = await prisma.order.count({
            where: {
                courier: "PostEx",
                orderDate: {
                    gte: start,
                    lte: end
                }
            }
        });
        console.log(`Total PostEx Orders in Jan 2026: ${count}`);
    } catch (e) {
        console.error("Count failed", e);
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
