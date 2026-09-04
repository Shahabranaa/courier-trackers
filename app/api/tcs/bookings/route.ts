import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTcsBooking, findTcsConsignmentNumber, getTcsBrandConfig, TcsBookingRequest } from "@/lib/tcs";

async function canAccessBrand(user: { id: string; role: string }, brandId: string) {
  if (user.role === "ADMIN") return true;
  const [brand, access] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { userId: true, isActive: true } }),
    prisma.userBrand.findUnique({ where: { userId_brandId: { userId: user.id, brandId } } }),
  ]);
  return !!brand?.isActive && (brand.userId === user.id || !!access);
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId")?.trim();
  if (!brandId || !(await canAccessBrand(user, brandId))) {
    return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
  }

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const orders = await prisma.order.findMany({
    where: {
      brandId,
      courier: "TCS",
      ...(startDate ? {
        orderDate: {
          gte: `${startDate}T00:00:00.000Z`,
          lte: `${endDate || startDate}T23:59:59.999Z`,
        },
      } : {}),
    },
    orderBy: { orderDate: "desc" },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as { brandId?: string; booking?: TcsBookingRequest };
    const brandId = body.brandId?.trim();
    const booking = body.booking;
    if (!brandId || !(await canAccessBrand(user, brandId))) {
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    }
    if (!booking?.shipperinfo?.tcsaccount || !booking.shipperinfo.shippername ||
        !booking.shipperinfo.address1 || !booking.shipperinfo.cityname ||
        !booking.shipperinfo.mobile || !booking.consigneeinfo?.firstname ||
        !booking.consigneeinfo.address1 || !booking.consigneeinfo.mobile ||
        !booking.shipmentinfo?.servicecode || booking.shipmentinfo.weightinkg <= 0 ||
        booking.shipmentinfo.pieces < 1 || booking.shipmentinfo.codamount < 0) {
      return NextResponse.json({ error: "Missing or invalid required booking fields" }, { status: 400 });
    }

    const brandConfig = await getTcsBrandConfig(brandId);
    const result = await createTcsBooking(booking, brandConfig?.credentials);
    const trackingNumber = findTcsConsignmentNumber(result);
    if (!trackingNumber) {
      return NextResponse.json({ error: "TCS accepted the request but returned no consignment number", result }, { status: 502 });
    }

    const now = new Date().toISOString();
    const customerName = [booking.consigneeinfo.firstname, booking.consigneeinfo.middlename, booking.consigneeinfo.lastname]
      .filter(Boolean).join(" ");
    await prisma.order.upsert({
      where: { trackingNumber },
      update: {
        brandId,
        courier: "TCS",
        orderRefNumber: booking.shipmentinfo.referenceno || trackingNumber,
        invoicePayment: booking.shipmentinfo.codamount,
        customerName,
        customerPhone: booking.consigneeinfo.mobile,
        deliveryAddress: booking.consigneeinfo.address1,
        cityName: booking.consigneeinfo.cityname || null,
        transactionDate: now,
        orderDetail: booking.shipmentinfo.contentdesc || "TCS shipment",
        orderType: "COD",
        orderDate: now,
        orderAmount: booking.shipmentinfo.codamount,
        orderStatus: "Booked",
        transactionStatus: "Booked",
        actualWeight: booking.shipmentinfo.weightinkg,
        lastFetchedAt: new Date(),
      },
      create: {
        trackingNumber,
        brandId,
        courier: "TCS",
        orderRefNumber: booking.shipmentinfo.referenceno || trackingNumber,
        invoicePayment: booking.shipmentinfo.codamount,
        customerName,
        customerPhone: booking.consigneeinfo.mobile,
        deliveryAddress: booking.consigneeinfo.address1,
        cityName: booking.consigneeinfo.cityname || null,
        transactionDate: now,
        orderDetail: booking.shipmentinfo.contentdesc || "TCS shipment",
        orderType: "COD",
        orderDate: now,
        orderAmount: booking.shipmentinfo.codamount,
        orderStatus: "Booked",
        transactionStatus: "Booked",
        actualWeight: booking.shipmentinfo.weightinkg,
      },
    });
    return NextResponse.json({ trackingNumber, result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to create TCS booking",
    }, { status: 502 });
  }
}