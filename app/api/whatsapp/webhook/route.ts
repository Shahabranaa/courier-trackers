import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig, verifyWebhookSignature } from "@/lib/whatsapp";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log("[WhatsApp Webhook] GET verification request:", { mode, tokenProvided: !!token, challenge: challenge?.substring(0, 20) });

  const config = getWhatsAppConfig();

  if (mode === "subscribe" && token === config.webhookVerifyToken) {
    console.log("[WhatsApp Webhook] Verification SUCCESS");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[WhatsApp Webhook] Verification FAILED - token mismatch");
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  console.log("[WhatsApp Webhook] POST received");

  try {
    const rawBody = await req.text();
    console.log("[WhatsApp Webhook] Raw body length:", rawBody.length);

    const signature = req.headers.get("x-hub-signature-256") || "";
    const config = getWhatsAppConfig();

    if (signature && config.appSecret) {
      const isValid = verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.warn("[WhatsApp Webhook] REJECTED: invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
      console.log("[WhatsApp Webhook] Signature verified OK");
    } else if (signature && !config.appSecret) {
      console.warn("[WhatsApp Webhook] Signature present but META_APP_SECRET not configured - skipping validation");
    } else {
      console.log("[WhatsApp Webhook] No signature header - processing without validation");
    }

    const body = JSON.parse(rawBody);
    console.log("[WhatsApp Webhook] Parsed body - object:", body.object, "entries:", body.entry?.length || 0);

    if (body.object !== "whatsapp_business_account") {
      console.warn("[WhatsApp Webhook] Ignored: object is", JSON.stringify(body.object), "- expected 'whatsapp_business_account'");
      console.log("[WhatsApp Webhook] Top-level keys:", Object.keys(body).join(", "));
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    let messagesProcessed = 0;
    let statusesProcessed = 0;

    for (const entry of body.entry || []) {
      console.log("[WhatsApp Webhook] Processing entry:", entry.id, "changes:", entry.changes?.length || 0);

      for (const change of entry.changes || []) {
        console.log("[WhatsApp Webhook] Change field:", change.field);
        if (change.field !== "messages") continue;

        const value = change.value;
        console.log("[WhatsApp Webhook] Messages count:", value.messages?.length || 0, "Statuses count:", value.statuses?.length || 0);

        if (value.messages) {
          for (const msg of value.messages) {
            console.log("[WhatsApp Webhook] Processing message:", msg.id, "type:", msg.type, "from:", msg.from);

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
              console.log("[WhatsApp Webhook] Created new contact:", contact.id, "waId:", msg.from);
            } else if (profileName && profileName !== contact.profileName) {
              contact = await prisma.whatsAppContact.update({
                where: { id: contact.id },
                data: { profileName },
              });
              console.log("[WhatsApp Webhook] Updated contact profile name:", profileName);
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

              messagesProcessed++;
              console.log("[WhatsApp Webhook] Saved message:", msg.id, "body:", messageBody.substring(0, 50));
            } else {
              console.log("[WhatsApp Webhook] Message already exists, skipped:", msg.id);
            }
          }
        }

        if (value.statuses) {
          for (const status of value.statuses) {
            try {
              const result = await prisma.whatsAppMessage.updateMany({
                where: { messageId: status.id },
                data: { status: status.status },
              });
              if (result.count > 0) statusesProcessed++;
              console.log("[WhatsApp Webhook] Status update:", status.id, "->", status.status, "matched:", result.count);
            } catch {
            }
          }
        }
      }
    }

    console.log("[WhatsApp Webhook] Done - messages:", messagesProcessed, "statuses:", statusesProcessed);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error: any) {
    console.error("[WhatsApp Webhook] ERROR:", error.message, error.stack?.substring(0, 200));
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
