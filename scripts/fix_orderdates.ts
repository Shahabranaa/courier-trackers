
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// This script fixes the orderDate for all orders where it was incorrectly set to the sync date.
// For each order where orderDate doesn't match transactionDate's month, we update orderDate = transactionDate.

async function main() {
    console.log("=== FIXING ORDERDATE FOR POSTEX ORDERS ===\n");

    // Find all PostEx orders where orderDate month doesn't match transactionDate month
    const allPostex = await prisma.order.findMany({
        where: { courier: "PostEx" },
        select: {
            trackingNumber: true,
            orderDate: true,
            transactionDate: true
        }
    });

    console.log(`Total PostEx orders: ${allPostex.length}`);

    let fixCount = 0;
    let skipCount = 0;

    for (const order of allPostex) {
        const od = order.orderDate;
        const td = order.transactionDate;

        // If both exist and months don't match, fix it
        if (td && od) {
            const odMonth = od.substring(0, 7);
            const tdMonth = td.substring(0, 7);

            if (odMonth !== tdMonth) {
                // Order date is wrong - update it to match transactionDate
                await prisma.order.update({
                    where: { trackingNumber: order.trackingNumber },
                    data: { orderDate: td }
                });
                fixCount++;

                if (fixCount % 100 === 0) {
                    console.log(`  Fixed ${fixCount} orders...`);
                }
            } else {
                skipCount++;
            }
        } else if (td && !od) {
            // orderDate is null, set it to transactionDate
            await prisma.order.update({
                where: { trackingNumber: order.trackingNumber },
                data: { orderDate: td }
            });
            fixCount++;
        } else {
            skipCount++;
        }
    }

    console.log(`\n=== COMPLETE ===`);
    console.log(`Fixed: ${fixCount} orders`);
    console.log(`Skipped (already correct): ${skipCount} orders`);
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
