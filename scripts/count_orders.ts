
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-01-31T23:59:59.999Z");

    const count = await prisma.order.count({
        where: {
            courier: "PostEx",
            orderDate: {
                gte: start.toISOString(),
                lte: end.toISOString()
            }
        }
    });

    console.log(`Total PostEx Orders in Jan 2026 (by Order Date): ${count}`);

    const byBrand = await prisma.order.groupBy({
        by: ['brandId'],
        where: {
            courier: "PostEx",
            orderDate: {
                gte: start.toISOString(),
                lte: end.toISOString()
            }
        },
        _count: {
            id: true
        }
    });

    console.log("By Brand:", byBrand);
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
