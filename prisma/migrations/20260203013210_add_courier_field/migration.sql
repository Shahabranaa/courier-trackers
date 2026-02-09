-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "trackingNumber" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL DEFAULT 'default',
    "courier" TEXT NOT NULL DEFAULT 'PostEx',
    "orderRefNumber" TEXT NOT NULL,
    "invoicePayment" REAL NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "transactionDate" TEXT NOT NULL,
    "orderDetail" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "orderDate" TEXT NOT NULL,
    "orderAmount" REAL NOT NULL,
    "orderStatus" TEXT NOT NULL,
    "transactionStatus" TEXT NOT NULL,
    "cityName" TEXT,
    "transactionTax" REAL,
    "transactionFee" REAL,
    "upfrontPayment" REAL,
    "actualWeight" REAL,
    "lastStatus" TEXT,
    "lastStatusTime" DATETIME,
    "reversalTax" REAL,
    "reversalFee" REAL,
    "salesWithholdingTax" REAL,
    "netAmount" REAL,
    "lastFetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Order" ("actualWeight", "brandId", "cityName", "customerName", "customerPhone", "deliveryAddress", "invoicePayment", "lastFetchedAt", "lastStatus", "lastStatusTime", "netAmount", "orderAmount", "orderDate", "orderDetail", "orderRefNumber", "orderStatus", "orderType", "reversalFee", "reversalTax", "salesWithholdingTax", "trackingNumber", "transactionDate", "transactionFee", "transactionStatus", "transactionTax", "upfrontPayment") SELECT "actualWeight", "brandId", "cityName", "customerName", "customerPhone", "deliveryAddress", "invoicePayment", "lastFetchedAt", "lastStatus", "lastStatusTime", "netAmount", "orderAmount", "orderDate", "orderDetail", "orderRefNumber", "orderStatus", "orderType", "reversalFee", "reversalTax", "salesWithholdingTax", "trackingNumber", "transactionDate", "transactionFee", "transactionStatus", "transactionTax", "upfrontPayment" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
