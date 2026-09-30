import { prisma } from "./prisma";

export type CourierKey = "postex" | "tranzo" | "zoom" | "tcs" | "shopify" | "leopards" | "mnp" | "trax";

export async function checkCourierEnabled(brandId: string, courier: CourierKey): Promise<boolean> {
  if (!brandId || brandId === "default") return true;
  try {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: {
        postexEnabled: true,
        tranzoEnabled: true,
        zoomEnabled: true,
        tcsEnabled: true,
        shopifyEnabled: true,
        leopardsEnabled: true,
        mnpEnabled: true,
        traxEnabled: true,
      },
    });
    if (!brand) return true;
    const map: Record<CourierKey, boolean> = {
      postex: brand.postexEnabled,
      tranzo: brand.tranzoEnabled,
      zoom: brand.zoomEnabled,
      tcs: brand.tcsEnabled,
      shopify: brand.shopifyEnabled,
      leopards: brand.leopardsEnabled,
      mnp: brand.mnpEnabled,
      trax: brand.traxEnabled,
    };
    return map[courier];
  } catch {
    return true;
  }
}
