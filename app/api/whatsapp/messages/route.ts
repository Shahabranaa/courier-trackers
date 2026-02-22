import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  const direction = searchParams.get("direction");
  const type = searchParams.get("type");
  const search = searchParams.get("search");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const mode = searchParams.get("mode") || "contacts";

  if (mode === "contacts") {
    const contacts = await prisma.whatsAppContact.findMany({
      where: {
        ...(search ? {
          OR: [
            { profileName: { contains: search, mode: "insensitive" } },
            { phoneNumber: { contains: search } },
            { waId: { contains: search } },
          ]
        } : {}),
      },
      include: {
        messages: {
          orderBy: { timestamp: "desc" },
          take: 1,
          select: { body: true, type: true, direction: true, timestamp: true },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalContacts = await prisma.whatsAppContact.count({
      where: {
        ...(search ? {
          OR: [
            { profileName: { contains: search, mode: "insensitive" } },
            { phoneNumber: { contains: search } },
            { waId: { contains: search } },
          ]
        } : {}),
      },
    });

    return NextResponse.json({
      contacts: contacts.map(c => ({
        id: c.id,
        waId: c.waId,
        profileName: c.profileName,
        phoneNumber: c.phoneNumber,
        lastMessageAt: c.lastMessageAt,
        messageCount: c._count.messages,
        lastMessage: c.messages[0] || null,
      })),
      total: totalContacts,
      page,
      pages: Math.ceil(totalContacts / limit),
    });
  }

  if (mode === "messages") {
    const where: any = {};
    const phone = searchParams.get("phone");

    if (contactId) where.contactId = contactId;
    if (direction) where.direction = direction;
    if (type) where.type = type;
    if (phone) {
      where.contact = {
        OR: [
          { phoneNumber: { contains: phone } },
          { waId: { contains: phone } },
        ]
      };
    }
    if (search) {
      where.body = { contains: search, mode: "insensitive" };
    }
    if (dateFrom || dateTo) {
      where.timestamp = {};
      if (dateFrom) where.timestamp.gte = new Date(dateFrom);
      if (dateTo) where.timestamp.lte = new Date(dateTo + "T23:59:59Z");
    }

    const [messages, total] = await Promise.all([
      prisma.whatsAppMessage.findMany({
        where,
        include: {
          contact: {
            select: { waId: true, profileName: true, phoneNumber: true },
          },
        },
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.whatsAppMessage.count({ where }),
    ]);

    return NextResponse.json({
      messages,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}
