import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { sendWhatsAppMessage, sendTemplateMessage } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { to, message, type, templateName, languageCode, components } = await req.json();

    if (!to) {
      return NextResponse.json({ error: "Recipient phone number is required" }, { status: 400 });
    }

    let result;

    if (type === "template" && templateName) {
      result = await sendTemplateMessage(to, templateName, languageCode || "en_US", components);
    } else {
      if (!message) {
        return NextResponse.json({ error: "Message text is required" }, { status: 400 });
      }
      result = await sendWhatsAppMessage(to, message);
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message || "Failed to send message" }, { status: 400 });
    }

    const waMessageId = result.messages?.[0]?.id;

    if (waMessageId) {
      let contact = await prisma.whatsAppContact.findUnique({
        where: { waId: to },
      });

      if (!contact) {
        contact = await prisma.whatsAppContact.create({
          data: {
            waId: to,
            phoneNumber: to,
          },
        });
      }

      await prisma.whatsAppMessage.create({
        data: {
          messageId: waMessageId,
          contactId: contact.id,
          direction: "outgoing",
          type: type === "template" ? "template" : "text",
          body: type === "template" ? `Template: ${templateName}` : message,
          timestamp: new Date(),
          status: "sent",
        },
      });

      await prisma.whatsAppContact.update({
        where: { id: contact.id },
        data: { lastMessageAt: new Date() },
      });
    }

    return NextResponse.json({ success: true, messageId: waMessageId });
  } catch (error: any) {
    console.error("Send WhatsApp message error:", error.message);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
