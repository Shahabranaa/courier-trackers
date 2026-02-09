
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("=== POSTEX DATA DEBUG REPORT ===\n");

    // 1. Get all PostEx orders and tally by brand manually
    const allPostexOrders = await prisma.order.findMany({
        where: { courier: "PostEx" },
        select: {
            brandId: true,
            orderDate: true,
            transactionDate: true,
            trackingNumber: true
        }
    });

    console.log(`Total PostEx orders in DB: ${allPostexOrders.length}\n`);

    // Tally by brand
    const brandCounts: Record<string, number> = {};
    allPostexOrders.forEach((o: any) => {
        brandCounts[o.brandId] = (brandCounts[o.brandId] || 0) + 1;
    });

    console.log("1. BRANDS IN DB (PostEx only):");
    Object.entries(brandCounts).forEach(([b, c]) => console.log(`   - ${b}: ${c} orders`));

    // Pick first brand for analysis
    const mainBrandId = Object.keys(brandCounts)[0];
    const mainBrandOrders = allPostexOrders.filter((o: any) => o.brandId === mainBrandId);

    console.log(`\n2. DATE ANALYSIS for brand: ${mainBrandId} (${mainBrandOrders.length} orders)`);

    // Tally by orderDate month
    const orderDateMonths: Record<string, number> = {};
    const transactionDateMonths: Record<string, number> = {};

    mainBrandOrders.forEach((o: any) => {
        const odMonth = o.orderDate ? o.orderDate.substring(0, 7) : "NULL";
        const tdMonth = o.transactionDate ? o.transactionDate.substring(0, 7) : "NULL";
        orderDateMonths[odMonth] = (orderDateMonths[odMonth] || 0) + 1;
        transactionDateMonths[tdMonth] = (transactionDateMonths[tdMonth] || 0) + 1;
    });

    console.log("\n   Orders by orderDate month:");
    Object.entries(orderDateMonths).sort().forEach(([m, c]) => console.log(`     ${m}: ${c}`));

    console.log("\n   Orders by transactionDate month:");
    Object.entries(transactionDateMonths).sort().forEach(([m, c]) => console.log(`     ${m}: ${c}`));

    // 3. January specifically
    const jan2026ByTD = mainBrandOrders.filter((o: any) =>
        o.transactionDate && o.transactionDate.startsWith("2026-01")
    );
    console.log(`\n3. JANUARY 2026 (by transactionDate): ${jan2026ByTD.length} orders`);

    const jan2026ByOD = mainBrandOrders.filter((o: any) =>
        o.orderDate && o.orderDate.startsWith("2026-01")
    );
    console.log(`   JANUARY 2026 (by orderDate): ${jan2026ByOD.length} orders`);

    // 4. Check mismatch
    let mismatchCount = 0;
    jan2026ByTD.forEach((o: any) => {
        if (!o.orderDate || !o.orderDate.startsWith("2026-01")) {
            mismatchCount++;
        }
    });
    console.log(`\n4. MISMATCH: ${mismatchCount} January orders have WRONG orderDate`);

    console.log("\n=== END REPORT ===");
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
