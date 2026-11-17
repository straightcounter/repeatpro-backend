
import express from "express";
import "dotenv/config";
import cronRouter from "./routes/cron.js";
import campaignRouter from "./routes/campaign.js";
import messagesRouter from "./routes/messages.js";

import {
  connectWhatsApp,
  getWhatsAppStatus,
} from "./services/whatsapp.js";

const app = express();

app.use(express.json());


app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "RepeatPro Automation API is running",
    whatsapp: getWhatsAppStatus() ? "connected" : "disconnected",
  });
});

app.use("/api/cron", cronRouter);
app.use("/api/campaign", campaignRouter);
app.use("/api/messages", messagesRouter);

const PORT = process.env.PORT || 3001;

app.listen(PORT, "127.0.0.1", () => {
  console.log(`🚀 RepeatPro API running on port ${PORT}`);

  connectWhatsApp().catch((error) => {
    console.error("WhatsApp startup error:", error);
  });
});
