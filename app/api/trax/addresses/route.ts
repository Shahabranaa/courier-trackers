import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { userCanAccessBrand } from "@/lib/brandAccess";
import { addTraxPickupAddress, getTraxBrandConfig } from "@/lib/trax";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const brandId = typeof body.brandId === "string" ? body.brandId.trim() : "";
  if (!(await userCanAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }
  const config = await getTraxBrandConfig(brandId);
  if (!config) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  if (!config.enabled) return NextResponse.json({ error: "TRAX is disabled for this brand" }, { status: 403 });

  const person = typeof body.personOfContact === "string" ? body.personOfContact.trim() : "";
  const phone = typeof body.phoneNumber === "string" ? body.phoneNumber.replace(/\D/g, "") : "";
  const email = typeof body.emailAddress === "string" ? body.emailAddress.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const cityId = Number(body.cityId);
  if (!person || person.length > 100 || !/^\d{7,20}$/.test(phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !address || address.length > 190 || !Number.isInteger(cityId) || cityId < 1) {
    return NextResponse.json({ error: "Enter a contact name, valid phone and email, pickup address, and city." }, { status: 400 });
  }

  try {
    const result = await addTraxPickupAddress({
      person_of_contact: person,
      phone_number: phone,
      Email_address: email,
      address,
      city_id: cityId,
    }, config.credentials);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add TRAX pickup address" }, { status: 502 });
  }
}