-- AlterTable
ALTER TABLE "Order" ADD COLUMN "actualWeight" REAL;
ALTER TABLE "Order" ADD COLUMN "lastStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "lastStatusTime" DATETIME;
ALTER TABLE "Order" ADD COLUMN "transactionFee" REAL;
ALTER TABLE "Order" ADD COLUMN "transactionTax" REAL;
ALTER TABLE "Order" ADD COLUMN "upfrontPayment" REAL;
