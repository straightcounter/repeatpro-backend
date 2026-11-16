
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from "@whiskeysockets/baileys";

import pino from "pino";
import qrcode from "qrcode-terminal";

let sock = null;
let isConnected = false;
let reconnectTimer = null;

export function getWhatsAppStatus() {
  return isConnected;
}

export async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["RepeatPro", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      console.log("\n📱 Scan QR from WhatsApp Linked Devices\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      isConnected = true;
      console.log("✅ WhatsApp connected successfully!");
    }

    if (connection === "close") {
      isConnected = false;
      sock = null;

      const code = lastDisconnect?.error?.output?.statusCode;

      console.log("❌ WhatsApp disconnected:", code);

      if (
        code !== DisconnectReason.loggedOut &&
        !reconnectTimer
      ) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectWhatsApp().catch(console.error);
        }, 3000);
      }
    }
  });
}

export async function sendWhatsAppMessage(phone, message) {
  if (!isConnected || !sock) {
    throw new Error("WhatsApp is not connected");
  }

  const number = String(phone).replace(/\D/g, "");

  if (!/^[1-9]\d{7,14}$/.test(number)) {
    throw new Error("Invalid international phone number");
  }

  const jid = `${number}@s.whatsapp.net`;

  const result = await sock.sendMessage(jid, {
    text: message,
  });

  if (!result?.key?.id) {
    throw new Error("WhatsApp did not return a message ID");
  }

  return result;
}
