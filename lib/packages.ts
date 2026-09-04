export interface PackageTier {
  id: string;
  name: string;
  pricePkr: number;
  priceLabel: string;
  tagline: string;
  popular?: boolean;
  features: string[];
}

export const PACKAGES: PackageTier[] = [
  {
    id: "starter",
    name: "Starter",
    pricePkr: 4999,
    priceLabel: "PKR 4,999",
    tagline: "Perfect for a single brand getting started.",
    features: [
      "1 active brand",
      "PostEx, Tranzo & Shopify sync",
      "WhatsApp order capture",
      "Basic finance tracking",
      "Up to 3 employee order links",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    pricePkr: 9999,
    priceLabel: "PKR 9,999",
    tagline: "Best for growing brands managing multiple stores.",
    popular: true,
    features: [
      "Up to 3 active brands",
      "All Starter features",
      "Discrepancy & smart alerts",
      "Customer & delivery insights",
      "Sales performance dashboards",
      "Up to 15 employee order links",
      "Priority email support",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    pricePkr: 19999,
    priceLabel: "PKR 19,999",
    tagline: "For agencies and multi-brand operators.",
    features: [
      "Unlimited active brands",
      "All Growth features",
      "Advanced analytics & exports",
      "Unlimited employee order links",
      "Multi-courier financial reports",
      "Dedicated WhatsApp support",
    ],
  },
];

export function getPackageById(id: string | null | undefined): PackageTier | null {
  if (!id) return null;
  return PACKAGES.find((p) => p.id === id) ?? null;
}
