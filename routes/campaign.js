
import { Router } from "express";
import supabase from "../config/supabase.js";
import {
  sendWhatsAppMessage,
  getWhatsAppStatus,
} from "../services/whatsapp.js";

const router = Router();

let isSending = false;

router.post("/send", async (req, res) => {
  const { businessId, customerIds } = req.body;

  if (!businessId || !Array.isArray(customerIds) || !customerIds.length) {
    return res.status(400).json({
      success: false,
      message: "Business ID and test customer IDs are required",
    });
  }

  if (isSending) {
    return res.status(409).json({
      success: false,
      message: "A campaign is already running",
    });
  }

  if (!getWhatsAppStatus()) {
    return res.status(503).json({
      success: false,
      message: "WhatsApp is not connected",
    });
  }

  isSending = true;

  try {
    const { data: template, error: templateError } = await supabase
      .from("message_templates")
      .select("campaign_message")
      .eq("business_id", businessId)
      .single();

    if (templateError) throw templateError;

    if (!template?.campaign_message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Campaign template is empty",
      });
    }

    const { data: customers, error: customerError } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("business_id", businessId)
      .in("id", customerIds)
      .limit(10);

    if (customerError) throw customerError;

    let sent = 0;
    let failed = 0;

    for (const customer of customers) {
      try {
        const digits = String(customer.phone).replace(/\D/g, "");

        const phone = digits.length === 10
          ? `91${digits}`
          : digits;

        const message = template.campaign_message
          .replaceAll("{name}", customer.name);

        const result = await sendWhatsAppMessage(phone, message);

        sent++;

        console.log("Campaign submitted:", {
          customer: customer.name,
          phone,
          messageId: result.key.id,
        });

      } catch (error) {
        failed++;

        console.error(
          `Campaign failed for ${customer.name}:`,
          error.message
        );
      }
    }

    return res.json({
      success: true,
      total: customers.length,
      sent,
      failed,
    });

  } catch (error) {
    console.error("Campaign error:", error);

    return res.status(500).json({
      success: false,
      message: "Campaign processing failed",
    });

  } finally {
    isSending = false;
  }
});

export default router;
