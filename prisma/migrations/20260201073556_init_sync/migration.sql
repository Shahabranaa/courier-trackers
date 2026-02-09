-- CreateTable
CREATE TABLE "Order" (
    "trackingNumber" TEXT NOT NULL PRIMARY KEY,
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
    "lastFetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TrackingStatus" (
    "trackingNumber" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrackingStatus_trackingNumber_fkey" FOREIGN KEY ("trackingNumber") REFERENCES "Order" ("trackingNumber") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentStatus" (
    "trackingNumber" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentStatus_trackingNumber_fkey" FOREIGN KEY ("trackingNumber") REFERENCES "Order" ("trackingNumber") ON DELETE CASCADE ON UPDATE CASCADE
);
