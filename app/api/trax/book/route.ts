import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { userCanAccessBrand } from "@/lib/brandAccess";
import { prisma } from "@/lib/prisma";
import { bookTraxShipment, getTraxBrandConfig, traxOrderBookingValues } from "@/lib/trax";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const stringValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
const integerValue = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};
const decimalValue = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

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
  if (!record(body.payload)) return NextResponse.json({ error: "Shipment booking details are required" }, { status: 400 });

  const input = body.payload;
  const billingAccountType = body.billingAccountType;
  const serviceTypeId = integerValue(input.service_type_id);
  if (serviceTypeId !== 1 && serviceTypeId !== 2) {
    return NextResponse.json({ error: "This booking form supports the documented Regular and Replacement service types." }, { status: 400 });
  }
  if (billingAccountType !== "corporate_invoicing" && billingAccountType !== "reimbursement") {
    return NextResponse.json({ error: "Select the TRAX billing account type to validate charges and delivery options." }, { status: 400 });
  }

  const pickupAddressId = integerValue(input.pickup_address_id);
  const informationDisplay = integerValue(input.information_display);
  const cityId = integerValue(input.consignee_city_id);
  const productTypeId = integerValue(input.item_product_type_id);
  const itemQuantity = integerValue(input.item_quantity);
  const insurance = integerValue(input.item_insurance);
  const pickupDate = stringValue(input.pickup_date);
  const estimatedWeight = decimalValue(input.estimated_weight);
  const shippingModeId = integerValue(input.shipping_mode_id);
  const amount = decimalValue(input.amount);
  const paymentModeId = integerValue(input.payment_mode_id);
  const chargesModeId = integerValue(input.charges_mode_id);
  const deliveryTypeId = input.delivery_type_id === undefined || input.delivery_type_id === "" ? null : integerValue(input.delivery_type_id);
  const openShipment = input.open_shipment === undefined || input.open_shipment === "" ? null : integerValue(input.open_shipment);
  const piecesQuantity = input.pieces_quantity === undefined || input.pieces_quantity === "" ? null : integerValue(input.pieces_quantity);
  const phone1 = stringValue(input.consignee_phone_number_1).replace(/\D/g, "");
  const phone2 = stringValue(input.consignee_phone_number_2).replace(/\D/g, "");
  const email = stringValue(input.consignee_email_address);
  const orderId = stringValue(input.order_id);
  const itemPrice = input.item_price === undefined || input.item_price === "" ? null : decimalValue(input.item_price);
  const sameDayTimingId = input.same_day_timing_id === undefined || input.same_day_timing_id === ""
    ? null
    : integerValue(input.same_day_timing_id);

  const requiredText = [
    ["Consignee name", stringValue(input.consignee_name), 100],
    ["Consignee address", stringValue(input.consignee_address), 190],
    ["Item description", stringValue(input.item_description), 190],
  ] as const;
  const invalidText = requiredText.find(([, value, maxLength]) => !value || value.length > maxLength);
  const replacementProductTypeId = integerValue(input.replacement_item_product_type_id);
  const replacementDescription = stringValue(input.replacement_item_description);
  const replacementQuantity = integerValue(input.replacement_item_quantity);
  const pickupDateObject = new Date(`${pickupDate}T00:00:00.000Z`);
  const dateValid = serviceTypeId === 2 || (/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)
    && !Number.isNaN(pickupDateObject.getTime())
    && pickupDateObject.toISOString().slice(0, 10) === pickupDate);
  const specialInstructions = stringValue(input.special_instructions);
  const shipperReferences = [1, 2, 3, 4, 5].map(index => stringValue(input[`shipper_reference_number_${index}`]));
  const invalidReferences = shipperReferences.some((value, index) => value.length > 0 && index > 0 && value.length > 190);
  const chargesModeValid = billingAccountType === "corporate_invoicing"
    ? [2, 3].includes(chargesModeId ?? -1)
    : [2, 4].includes(chargesModeId ?? -1);

  if (invalidText || !pickupAddressId || pickupAddressId < 1 || ![0, 1].includes(informationDisplay ?? -1)
    || !cityId || cityId < 1 || !productTypeId || productTypeId < 1 || productTypeId > 24
    || !itemQuantity || itemQuantity < 1 || ![0, 1].includes(insurance ?? -1)
    || (insurance === 1 && (itemPrice === null || !Number.isInteger(itemPrice) || itemPrice < 0))
    || (itemPrice !== null && (!Number.isInteger(itemPrice) || itemPrice < 0 || insurance !== 1))
    || !dateValid || estimatedWeight === null || estimatedWeight <= 0
    || !shippingModeId || shippingModeId < 1 || shippingModeId > 4
    || (input.same_day_timing_id !== undefined && input.same_day_timing_id !== "" && (shippingModeId !== 4 || !sameDayTimingId || ![1, 2].includes(sameDayTimingId)))
    || amount === null || !Number.isInteger(amount) || amount < 0 || ![1, 2, 4].includes(paymentModeId ?? -1)
    || !chargesModeValid
    || (billingAccountType === "corporate_invoicing" && ![1, 2].includes(deliveryTypeId ?? -1))
    || (billingAccountType === "reimbursement" && deliveryTypeId !== null)
    || (openShipment !== null && ![0, 1].includes(openShipment))
    || (piecesQuantity !== null && (serviceTypeId !== 1 || piecesQuantity < 1 || piecesQuantity > 10))
    || !/^03\d{9}$/.test(phone1) || (phone2 && !/^03\d{9}$/.test(phone2))
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || orderId.length > 100
    || invalidReferences || (serviceTypeId === 2 && specialInstructions.length > 250)
    || (serviceTypeId === 2 && (!replacementProductTypeId || replacementProductTypeId < 1 || replacementProductTypeId > 24
      || !replacementDescription || replacementDescription.length > 190 || !replacementQuantity || replacementQuantity < 1))) {
    return NextResponse.json({ error: "One or more booking fields are invalid. Check the required fields and TRAX limits." }, { status: 400 });
  }

  if (orderId) {
    const duplicate = await prisma.order.findFirst({
      where: { brandId, courier: "TRAX", orderRefNumber: orderId },
      select: { trackingNumber: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: `Order reference ${orderId} is already booked as ${duplicate.trackingNumber}.` }, { status: 409 });
    }
  }

  const payload: Record<string, unknown> = {
    service_type_id: serviceTypeId,
    pickup_address_id: pickupAddressId,
    information_display: informationDisplay,
    consignee_city_id: cityId,
    consignee_name: stringValue(input.consignee_name),
    consignee_address: stringValue(input.consignee_address),
    consignee_phone_number_1: phone1,
    consignee_email_address: email,
    item_product_type_id: productTypeId,
    item_description: stringValue(input.item_description),
    item_quantity: itemQuantity,
    item_insurance: insurance,
    estimated_weight: estimatedWeight,
    shipping_mode_id: shippingModeId,
    amount,
    payment_mode_id: paymentModeId,
    charges_mode_id: chargesModeId,
    ...(phone2 ? { consignee_phone_number_2: phone2 } : {}),
    ...(orderId ? { order_id: orderId } : {}),
    ...(itemPrice !== null ? { item_price: itemPrice } : {}),
    ...(serviceTypeId === 1 ? { pickup_date: pickupDate } : {}),
    ...(specialInstructions ? { special_instructions: specialInstructions } : {}),
    ...(sameDayTimingId !== null ? { same_day_timing_id: sameDayTimingId } : {}),
    ...(openShipment !== null ? { open_shipment: openShipment } : {}),
    ...(billingAccountType === "corporate_invoicing" ? { delivery_type_id: deliveryTypeId } : {}),
    ...(serviceTypeId === 1 && piecesQuantity !== null ? { pieces_quantity: piecesQuantity } : {}),
    ...shipperReferences.reduce<Record<string, string>>((refs, value, index) => {
      if (value) refs[`shipper_reference_number_${index + 1}`] = value;
      return refs;
    }, {}),
    ...(serviceTypeId === 2 ? {
      replacement_item_product_type_id: replacementProductTypeId,
      replacement_item_description: replacementDescription,
      replacement_item_quantity: replacementQuantity,
    } : {}),
  };

  let bookingResponse: unknown;
  try {
    bookingResponse = await bookTraxShipment(payload, config.credentials);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "TRAX booking failed" }, { status: 502 });
  }

  const result = bookingResponse as Record<string, unknown>;
  const trackingNumber = String(result["tracking number"] ?? result.tracking_number ?? "").trim();
  if (!/^\d+$/.test(trackingNumber)) {
    return NextResponse.json({ error: "TRAX returned a successful response without a numeric tracking number.", response: bookingResponse }, { status: 502 });
  }

  const collision = await prisma.order.findUnique({ where: { trackingNumber }, select: { brandId: true, courier: true } });
  if (collision) {
    return NextResponse.json({
      error: "TRAX accepted the booking, but this tracking number already exists in the dashboard and was not overwritten.",
      trackingNumber,
    }, { status: 409 });
  }

  const cityName = stringValue(body.cityName);
  const orderData = traxOrderBookingValues({ ...payload, brandId, consignee_city_name: cityName }, trackingNumber);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.order.create({ data: orderData });
      await tx.trackingStatus.create({
        data: {
          trackingNumber,
          data: JSON.stringify({
            trackingNumber,
            currentStatus: "Booked",
            statusCategory: "in_process",
            activityHistory: [],
            raw: { booking: bookingResponse },
          }),
        },
      });
    });
  } catch (error) {
    console.error("TRAX booking was accepted but could not be saved:", error instanceof Error ? error.message : error);
    return NextResponse.json({
      error: "TRAX accepted the booking, but it could not be saved locally. Contact support with this tracking number.",
      trackingNumber,
    }, { status: 500 });
  }

  const order = await prisma.order.findUnique({ where: { trackingNumber }, include: { trackingStatus: true, paymentStatus: true } });
  return NextResponse.json({ trackingNumber, bookingResponse, order }, { status: 201 });
}