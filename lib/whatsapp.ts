import crypto from "crypto";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export function getWhatsAppConfig() {
  return {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    wabaId: process.env.WHATSAPP_WABA_ID || "",
    appId: process.env.META_APP_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "hublogistic_webhook_verify_2026",
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const config = getWhatsAppConfig();
  if (!config.appSecret) return false;

  const expectedSignature = crypto
    .createHmac("sha256", config.appSecret)
    .update(rawBody)
    .digest("hex");

  return signature === `sha256=${expectedSignature}`;
}

export async function sendWhatsAppMessage(to: string, text: string) {
  const config = getWhatsAppConfig();

  if (!config.phoneNumberId) {
    console.error("[WhatsApp Send] WHATSAPP_PHONE_NUMBER_ID is not configured");
    return { error: { message: "WhatsApp Phone Number ID is not configured. Please set WHATSAPP_PHONE_NUMBER_ID in secrets." } };
  }
  if (!config.accessToken) {
    console.error("[WhatsApp Send] WHATSAPP_ACCESS_TOKEN is not configured");
    return { error: { message: "WhatsApp Access Token is not configured. Please set WHATSAPP_ACCESS_TOKEN in secrets." } };
  }

  const url = `${GRAPH_API_BASE}/${config.phoneNumberId}/messages`;
  console.log("[WhatsApp Send] URL:", url);
  console.log("[WhatsApp Send] Phone Number ID:", config.phoneNumberId);
  console.log("[WhatsApp Send] To:", to);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    console.error("[WhatsApp Send] Meta API error:", JSON.stringify(data.error || data, null, 2));
    console.error("[WhatsApp Send] HTTP status:", res.status);
  } else {
    console.log("[WhatsApp Send] Success - message ID:", data.messages?.[0]?.id);
  }

  return data;
}

export async function getPhoneNumberInfo() {
  const config = getWhatsAppConfig();
  const url = `${GRAPH_API_BASE}/${config.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,messaging_limit_tier`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  return res.json();
}

export async function getBusinessProfile() {
  const config = getWhatsAppConfig();
  const url = `${GRAPH_API_BASE}/${config.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  return res.json();
}

export async function getMessageTemplates() {
  const config = getWhatsAppConfig();
  const url = `${GRAPH_API_BASE}/${config.wabaId}/message_templates?limit=100`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  return res.json();
}

export async function sendTemplateMessage(to: string, templateName: string, languageCode: string = "en_US", components?: any[]) {
  const config = getWhatsAppConfig();
  const url = `${GRAPH_API_BASE}/${config.phoneNumberId}/messages`;

  const body: any = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  if (components) {
    body.template.components = components;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return res.json();
}

export async function markMessageAsRead(messageId: string) {
  const config = getWhatsAppConfig();
  const url = `${GRAPH_API_BASE}/${config.phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });

  return res.json();
}

export async function getMediaUrl(mediaId: string) {
  const config = getWhatsAppConfig();
  const url = `${GRAPH_API_BASE}/${mediaId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  return res.json();
}
