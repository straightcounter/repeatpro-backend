
import { Router } from "express";
import supabase from "../config/supabase.js";
import {
  sendWhatsAppMessage,
  getWhatsAppStatus,
} from "../services/whatsapp.js";

const router = Router();

router.post("/thank-you", async (req, res) => {
  try {
    const { businessId, customerId } = req.body;

    if (!businessId || !customerId) {
      return res.status(400).json({
        success: false,
        message: "Business ID and Customer ID are required",
      });
    }

    if (!getWhatsAppStatus()) {
      return res.status(503).json({
        success: false,
        message: "WhatsApp is not connected",
      });
    }

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, shop_name")
      .eq("id", businessId)
      .single();

    if (businessError || !business) {
      return res.status(404).json({
        success: false,
        message: "Business not found",
      });
    }

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("id", customerId)
      .eq("business_id", businessId)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const { data: template, error: templateError } = await supabase
      .from("message_templates")
      .select("thank_you_message")
      .eq("business_id", businessId)
      .single();

    if (templateError || !template?.thank_you_message?.trim()) {
      return res.status(404).json({
        success: false,
        message: "Thank You template not found",
      });
    }

    const message = template.thank_you_message
      .replaceAll("{customer_name}", customer.name)
      .replaceAll("{business_name}", business.shop_name);

    const digits = String(customer.phone).replace(/\D/g, "");
    const phone = digits.length === 10 ? `91${digits}` : digits;

    const result = await sendWhatsAppMessage(phone, message);

    console.log("Thank You message submitted:", {
      customer: customer.name,
      phone,
      messageId: result.key.id,
    });

    return res.json({
      success: true,
      message: "Thank You message submitted successfully",
    });
  } catch (error) {
    console.error("Thank You message error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send Thank You message",
    });
  }
});

export default router;
