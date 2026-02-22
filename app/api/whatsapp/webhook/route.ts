import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig, verifyWebhookSignature } from "@/lib/whatsapp";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const config = getWhatsAppConfig();

  if (mode === "subscribe" && token === config.webhookVerifyToken) {
    console.log("WhatsApp webhook verified");
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    const signature = req.headers.get("x-hub-signature-256") || "";
    if (signature) {
      const isValid = verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.warn("WhatsApp webhook: invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const body = JSON.parse(rawBody);

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        const value = change.value;

        if (value.messages) {
          for (const msg of value.messages) {
            const contactInfo = value.contacts?.find((c: any) => c.wa_id === msg.from);
            const profileName = contactInfo?.profile?.name || "";

            let contact = await prisma.whatsAppContact.findUnique({
              where: { waId: msg.from },
            });

            if (!contact) {
              contact = await prisma.whatsAppContact.create({
                data: {
                  waId: msg.from,
                  phoneNumber: msg.from,
                  profileName,
                },
              });
            } else if (profileName && profileName !== contact.profileName) {
              contact = await prisma.whatsAppContact.update({
                where: { id: contact.id },
                data: { profileName },
              });
            }

            let messageBody = "";
            let mediaUrl = "";
            let mediaType = "";

            switch (msg.type) {
              case "text":
                messageBody = msg.text?.body || "";
                break;
              case "image":
                mediaType = "image";
                messageBody = msg.image?.caption || "";
                mediaUrl = msg.image?.id || "";
                break;
              case "video":
                mediaType = "video";
                messageBody = msg.video?.caption || "";
                mediaUrl = msg.video?.id || "";
                break;
              case "audio":
                mediaType = "audio";
                mediaUrl = msg.audio?.id || "";
                break;
              case "document":
                mediaType = "document";
                messageBody = msg.document?.caption || msg.document?.filename || "";
                mediaUrl = msg.document?.id || "";
                break;
              case "sticker":
                mediaType = "sticker";
                mediaUrl = msg.sticker?.id || "";
                break;
              case "location":
                messageBody = JSON.stringify({
                  latitude: msg.location?.latitude,
                  longitude: msg.location?.longitude,
                  name: msg.location?.name,
                  address: msg.location?.address,
                });
                break;
              case "contacts":
                messageBody = JSON.stringify(msg.contacts);
                break;
              case "interactive":
                messageBody = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "";
                break;
              case "button":
                messageBody = msg.button?.text || "";
                break;
              case "reaction":
                messageBody = msg.reaction?.emoji || "";
                break;
              default:
                messageBody = JSON.stringify(msg[msg.type] || {});
            }

            const existing = await prisma.whatsAppMessage.findUnique({
              where: { messageId: msg.id },
            });

            if (!existing) {
              await prisma.whatsAppMessage.create({
                data: {
                  messageId: msg.id,
                  contactId: contact.id,
                  direction: "incoming",
                  type: msg.type,
                  body: messageBody,
                  mediaUrl,
                  mediaType,
                  timestamp: new Date(parseInt(msg.timestamp) * 1000),
                  contextMsgId: msg.context?.id || null,
                  metadata: JSON.stringify({
                    from: msg.from,
                    phoneNumberId: value.metadata?.phone_number_id,
                  }),
                },
              });

              await prisma.whatsAppContact.update({
                where: { id: contact.id },
                data: { lastMessageAt: new Date(parseInt(msg.timestamp) * 1000) },
              });
            }
          }
        }

        if (value.statuses) {
          for (const status of value.statuses) {
            try {
              await prisma.whatsAppMessage.updateMany({
                where: { messageId: status.id },
                data: { status: status.status },
              });
            } catch {
            }
          }
        }
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error: any) {
    console.error("WhatsApp webhook error:", error.message);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
