import { prisma } from "@/lib/prisma";

export async function userCanAccessBrand(user: { id: string; role: string }, brandId: string) {
  if (!brandId) return false;
  if (user.role === "ADMIN") return true;

  const [brand, access] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { userId: true, isActive: true } }),
    prisma.userBrand.findUnique({ where: { userId_brandId: { userId: user.id, brandId } } }),
  ]);
  return Boolean(brand?.isActive && (brand.userId === user.id || access));
}