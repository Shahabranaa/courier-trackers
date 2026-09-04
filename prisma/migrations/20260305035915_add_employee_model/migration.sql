-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateTable
CREATE TABLE "Order" (
    "trackingNumber" TEXT NOT NULL,
    "brandId" TEXT NOT NULL DEFAULT 'default',
    "courier" TEXT NOT NULL DEFAULT 'PostEx',
    "orderRefNumber" TEXT NOT NULL,
    "invoicePayment" DOUBLE PRECISION NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "transactionDate" TEXT NOT NULL,
    "orderDetail" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "orderDate" TEXT NOT NULL,
    "orderAmount" DOUBLE PRECISION NOT NULL,
    "orderStatus" TEXT NOT NULL,
    "transactionStatus" TEXT NOT NULL,
    "cityName" TEXT,
    "transactionTax" DOUBLE PRECISION,
    "transactionFee" DOUBLE PRECISION,
    "upfrontPayment" DOUBLE PRECISION,
    "actualWeight" DOUBLE PRECISION,
    "lastStatus" TEXT,
    "lastStatusTime" TIMESTAMP(3),
    "reversalTax" DOUBLE PRECISION,
    "reversalFee" DOUBLE PRECISION,
    "salesWithholdingTax" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'synced',
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("trackingNumber")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBrand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "apiToken" TEXT NOT NULL DEFAULT '',
    "tranzoToken" TEXT NOT NULL DEFAULT '',
    "tranzoApiToken" TEXT NOT NULL DEFAULT '',
    "proxyUrl" TEXT NOT NULL DEFAULT '',
    "shopifyStore" TEXT NOT NULL DEFAULT '',
    "shopifyAccessToken" TEXT NOT NULL DEFAULT '',
    "shopifyClientId" TEXT NOT NULL DEFAULT '',
    "shopifyClientSecret" TEXT NOT NULL DEFAULT '',
    "postexMerchantId" TEXT NOT NULL DEFAULT '',
    "postexMerchantToken" TEXT NOT NULL DEFAULT '',
    "tranzoMerchantToken" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "shopifyOrderId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderName" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "customerName" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL,
    "financialStatus" TEXT NOT NULL DEFAULT '',
    "fulfillmentStatus" TEXT NOT NULL DEFAULT '',
    "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "lineItems" TEXT NOT NULL DEFAULT '[]',
    "fulfillments" TEXT NOT NULL DEFAULT '[]',
    "trackingNumbers" TEXT NOT NULL DEFAULT '[]',
    "courierPartner" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "shippingAddress" TEXT NOT NULL DEFAULT '',
    "shippingCity" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "pendingRemark" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopifyOrder_pkey" PRIMARY KEY ("shopifyOrderId")
);

-- CreateTable
CREATE TABLE "PostexCpr" (
    "cprId" INTEGER NOT NULL,
    "brandId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL DEFAULT '',
    "merchantName" TEXT NOT NULL DEFAULT '',
    "cprNumber" TEXT NOT NULL DEFAULT '',
    "statusId" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT '',
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createDatetime" TEXT NOT NULL DEFAULT '',
    "approveDate" TEXT NOT NULL DEFAULT '',
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostexCpr_pkey" PRIMARY KEY ("cprId")
);

-- CreateTable
CREATE TABLE "TranzoInvoice" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "brandId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "invoiceType" TEXT NOT NULL DEFAULT '',
    "merchant" TEXT NOT NULL DEFAULT '',
    "merchantStore" TEXT,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceStatus" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "approvedAt" TEXT,
    "approvedBy" TEXT,
    "holdAt" TEXT,
    "holdBy" TEXT,
    "settledAt" TEXT,
    "settledBy" TEXT,
    "disputedAt" TEXT,
    "disputedBy" TEXT,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranzoInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingStatus" (
    "trackingNumber" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingStatus_pkey" PRIMARY KEY ("trackingNumber")
);

-- CreateTable
CREATE TABLE "PaymentStatus" (
    "trackingNumber" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentStatus_pkey" PRIMARY KEY ("trackingNumber")
);

-- CreateIndex
CREATE INDEX "Order_brandId_orderDate_idx" ON "Order"("brandId", "orderDate");

-- CreateIndex
CREATE INDEX "Order_brandId_courier_idx" ON "Order"("brandId", "courier");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserBrand_userId_idx" ON "UserBrand"("userId");

-- CreateIndex
CREATE INDEX "UserBrand_brandId_idx" ON "UserBrand"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBrand_userId_brandId_key" ON "UserBrand"("userId", "brandId");

-- CreateIndex
CREATE INDEX "Brand_userId_idx" ON "Brand"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_username_key" ON "Employee"("username");

-- CreateIndex
CREATE INDEX "Employee_brandId_idx" ON "Employee"("brandId");

-- CreateIndex
CREATE INDEX "ShopifyOrder_brandId_createdAt_idx" ON "ShopifyOrder"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "PostexCpr_brandId_idx" ON "PostexCpr"("brandId");

-- CreateIndex
CREATE INDEX "PostexCpr_brandId_createDatetime_idx" ON "PostexCpr"("brandId", "createDatetime");

-- CreateIndex
CREATE INDEX "TranzoInvoice_brandId_idx" ON "TranzoInvoice"("brandId");

-- CreateIndex
CREATE INDEX "TranzoInvoice_brandId_createdAt_idx" ON "TranzoInvoice"("brandId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TranzoInvoice_brandId_invoiceId_key" ON "TranzoInvoice"("brandId", "invoiceId");

-- AddForeignKey
ALTER TABLE "UserBrand" ADD CONSTRAINT "UserBrand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBrand" ADD CONSTRAINT "UserBrand_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingStatus" ADD CONSTRAINT "TrackingStatus_trackingNumber_fkey" FOREIGN KEY ("trackingNumber") REFERENCES "Order"("trackingNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentStatus" ADD CONSTRAINT "PaymentStatus_trackingNumber_fkey" FOREIGN KEY ("trackingNumber") REFERENCES "Order"("trackingNumber") ON DELETE CASCADE ON UPDATE CASCADE;
