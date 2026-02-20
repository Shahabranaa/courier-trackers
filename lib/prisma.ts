import { PrismaClient } from '@prisma/client';

if (process.env.NEON_DATABASE_URL && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
    });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
