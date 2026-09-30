import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { userCanAccessBrand } from "@/lib/brandAccess";
import { getTraxBrandConfig, getTraxCities, getTraxPickupAddresses } from "@/lib/trax";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get("brandId")?.trim() || "";
  if (!(await userCanAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }
  const config = await getTraxBrandConfig(brandId);
  if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!config.enabled) return NextResponse.json({ error: "TRAX is disabled for this brand" }, { status: 403 });

  try {
    const [citiesResponse, addressesResponse] = await Promise.all([
      getTraxCities(config.credentials),
      getTraxPickupAddresses(config.credentials),
    ]);
    const cities = (citiesResponse as Record<string, unknown>)?.cities;
    const pickupAddresses = (addressesResponse as Record<string, unknown>)?.pickup_addresses;
    return NextResponse.json({
      cities: Array.isArray(cities) ? cities : [],
      pickupAddresses: Array.isArray(pickupAddresses) ? pickupAddresses : [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load TRAX cities and pickup addresses" }, { status: 502 });
  }
}