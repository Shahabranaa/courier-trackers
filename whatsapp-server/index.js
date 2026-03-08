require("dotenv").config();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { PrismaClient } = require("@prisma/client");
const express = require("express");
const QRCode = require("qrcode");
const pino = require("pino");
const { detectOrder } = require("./orderDetector");

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;
const BRAND_ID = process.env.BRAND_ID || "";
const AUTH_DIR = "./auth_state";

let sock = null;
let currentQR = "";
let connectionStatus = "disconnected";

const logger = pino({ level: "silent" });

async function updateSessionStatus(status, phone = "", qrCode = "") {
    try {
        await prisma.whatsAppSession.upsert({
            where: { id: "default" },
            update: { status, phone, qrCode, ...(status === "connected" ? { lastConnected: new Date() } : {}) },
            create: { id: "default", status, phone, qrCode, lastConnected: status === "connected" ? new Date() : null },
        });
    } catch (err) {
        console.error("Failed to update session status:", err.message);
    }
}

function extractPhoneFromJid(jid) {
    if (!jid) return "";
    const num = jid.split("@")[0];
    if (num.startsWith("92")) return "0" + num.substring(2);
    return num;
}

async function saveMessage(msg) {
    try {
        if (!msg.message || !msg.key.remoteJid) return;
        if (msg.key.remoteJid.endsWith("@g.us")) return;

        const messageText =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.documentMessage?.caption ||
            "";

        if (!messageText.trim()) return;

        const msgType = msg.message.conversation || msg.message.extendedTextMessage
            ? "text"
            : msg.message.imageMessage
                ? "image"
                : msg.message.documentMessage
                    ? "document"
                    : "other";

        const senderPhone = extractPhoneFromJid(msg.key.remoteJid);
        const senderName = msg.pushName || "";
        const isFromMe = msg.key.fromMe || false;
        const timestamp = new Date((msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000);
        const whatsappMessageId = msg.key.id || `${Date.now()}-${Math.random()}`;

        const { isOrder, parsed } = detectOrder(messageText);

        await prisma.whatsAppMessage.upsert({
            where: { whatsappMessageId },
            update: {},
            create: {
                brandId: BRAND_ID,
                remoteJid: msg.key.remoteJid,
                senderName,
                senderPhone,
                message: messageText,
                messageType: msgType,
                timestamp,
                isFromMe,
                isOrderDetected: isOrder,
                parsedOrder: parsed ? JSON.stringify(parsed) : "",
                whatsappMessageId,
            },
        });

        const orderTag = isOrder ? " [ORDER DETECTED]" : "";
        console.log(`${isFromMe ? "SENT" : "RECV"} ${senderName || senderPhone}: ${messageText.substring(0, 80)}${orderTag}`);
    } catch (err) {
        if (err.code !== "P2002") {
            console.error("Error saving message:", err.message);
        }
    }
}

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: true,
        browser: ["HubLogistic", "Chrome", "1.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = await QRCode.toDataURL(qr);
            connectionStatus = "qr_pending";
            await updateSessionStatus("qr_pending", "", currentQR);
            console.log("QR Code generated — scan with WhatsApp");
        }

        if (connection === "open") {
            currentQR = "";
            connectionStatus = "connected";
            const phone = sock.user?.id?.split(":")[0] || "";
            await updateSessionStatus("connected", phone, "");
            console.log(`Connected to WhatsApp as ${phone}`);
        }

        if (connection === "close") {
            connectionStatus = "disconnected";
            await updateSessionStatus("disconnected");
            const reason = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            console.log(`Disconnected (reason: ${reason}). Reconnecting: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(startWhatsApp, 3000);
            } else {
                console.log("Logged out. Delete auth_state folder and restart to re-scan QR.");
            }
        }
    });

    sock.ev.on("messages.upsert", async ({ messages: msgs, type }) => {
        if (type !== "notify") return;
        for (const msg of msgs) {
            await saveMessage(msg);
        }
    });
}

app.get("/status", (req, res) => {
    res.json({ status: connectionStatus, qr: currentQR ? true : false });
});

app.get("/qr", (req, res) => {
    if (currentQR) {
        res.json({ qrCode: currentQR });
    } else {
        res.json({ qrCode: null, message: connectionStatus === "connected" ? "Already connected" : "No QR available" });
    }
});

app.post("/restart", async (req, res) => {
    console.log("Restart requested");
    if (sock) {
        sock.end(undefined);
    }
    setTimeout(startWhatsApp, 1000);
    res.json({ message: "Restarting..." });
});

app.listen(PORT, () => {
    console.log(`WhatsApp server running on port ${PORT}`);
    console.log(`Brand ID: ${BRAND_ID || "NOT SET — set BRAND_ID env var"}`);

    if (!BRAND_ID) {
        console.error("WARNING: BRAND_ID not set. Messages won't be linked to any brand.");
    }

    startWhatsApp();
});
