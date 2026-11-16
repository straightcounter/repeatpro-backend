import "dotenv/config";

import {
  connectWhatsApp,
  sendWhatsAppMessage,
  getWhatsAppStatus,
} from "./services/whatsapp.js";

async function test() {
  await connectWhatsApp();

  const timeout = Date.now() + 30000;

  while (!getWhatsAppStatus() && Date.now() < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (!getWhatsAppStatus()) {
    console.log("WhatsApp connection timed out");
    return;
  }

  const result = await sendWhatsAppMessage(
    "918850192746",
    "Hello! RepeatPro WhatsApp automation is working!"
  );

  console.log("Message submitted:", result?.key?.id);
}

test().catch(console.error);