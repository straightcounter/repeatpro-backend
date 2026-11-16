
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import supabase from "../config/supabase.js";
import {
  sendWhatsAppMessage,
  getWhatsAppStatus,
} from "../services/whatsapp.js";
import "dotenv/config";

const router = Router();

let isProcessing = false;

router.post("/messages", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const token = req.headers.authorization || "";

  if (!secret) {
    return res.status(503).json({
      success: false,
      message: "Cron secret not configured",
    });
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(token);

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  if (isProcessing) {
    return res.status(409).json({
      success: false,
      message: "Cron is already running",
    });
  }

  if (!getWhatsAppStatus()) {
    return res.status(503).json({
      success: false,
      message: "WhatsApp is not connected",
    });
  }

  isProcessing = true;

  let sent = 0;
  let failed = 0;
  let uncertain = 0;
  let skipped = 0;

  try {
    const now = new Date().toISOString();

    const { data: messages, error } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (error) throw error;

    console.log(`[CRON] Found ${messages.length} scheduled messages`);

    for (const item of messages) {
      let claimed = false;
      let sendAttempted = false;
      let submittedToWhatsApp = false;

      try {
        const { data: claim, error: claimError } = await supabase
          .from("scheduled_messages")
          .update({
            status: "processing",
            processed_at: new Date().toISOString(),
            attempts: (item.attempts ?? 0) + 1,
            last_error: null,
          })
          .eq("id", item.id)
          .eq("status", "pending")
          .select("id");

        if (claimError) throw claimError;

        if (!claim?.length) {
          skipped++;
          continue;
        }

        claimed = true;

        const { data: customer, error: customerError } = await supabase
          .from("customers")
          .select("id, name, phone, business_id")
          .eq("id", item.customer_id)
          .eq("business_id", item.business_id)
          .single();

        if (customerError || !customer) {
          throw new Error(
            `Customer not found: ${customerError?.message || item.customer_id}`
          );
        }

        const { data: business, error: businessError } = await supabase
          .from("businesses")
          .select("id, shop_name")
          .eq("id", item.business_id)
          .single();

        if (businessError || !business) {
          throw new Error(
            `Business not found: ${businessError?.message || item.business_id}`
          );
        }

        if (!customer.phone) {
          throw new Error("Customer phone number missing");
        }

        if (!item.message?.trim()) {
          throw new Error("Message is empty");
        }

        const digits = String(customer.phone).replace(/\D/g, "");

        let phone;

        if (/^[6-9]\d{9}$/.test(digits)) {
          phone = `91${digits}`;
        } else if (/^91[6-9]\d{9}$/.test(digits)) {
          phone = digits;
        } else {
          throw new Error("Invalid Indian phone number");
        }

        console.log("--------------------------------");
        console.log(`[MESSAGE] ID: ${item.id}`);
        console.log(`[MESSAGE] Shop: ${business.shop_name}`);
        console.log(`[MESSAGE] Customer: ${customer.name}`);
        console.log("[MESSAGE] Sending WhatsApp message...");

        // Restrict recipients while testing locally.
        const testPhone = process.env.WHATSAPP_TEST_PHONE
          ?.replace(/\D/g, "");

        if (process.env.NODE_ENV !== "production") {
          if (!testPhone || phone !== testPhone) {
            throw new Error(
              "Test mode: recipient is not WHATSAPP_TEST_PHONE"
            );
          }
        }

        sendAttempted = true;

        const result = await sendWhatsAppMessage(
          phone,
          item.message
        );

        if (!result?.key?.id) {
          throw new Error("WhatsApp did not return a message ID");
        }

        submittedToWhatsApp = true;

        console.log(
          `[WHATSAPP] Submitted: ${result.key.id}`
        );

        const { data: updated, error: updateError } = await supabase
          .from("scheduled_messages")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", item.id)
          .eq("status", "processing")
          .select("id");

        if (updateError) throw updateError;

        if (!updated?.length) {
          throw new Error("Message sent but database status was not updated");
        }

        sent++;

        console.log(`[MESSAGE] ${item.id} marked as sent`);
      } catch (error) {
        console.error(
          `[MESSAGE ERROR] ${item.id}: ${error.message}`
        );

        if (!claimed) {
          failed++;
          continue;
        }

        // Once sending has been attempted, the result may be
        // uncertain. Do not automatically retry the message.
        if (sendAttempted || submittedToWhatsApp) {
          uncertain++;

          const { error: statusError } = await supabase
            .from("scheduled_messages")
            .update({
              last_error: `Delivery outcome uncertain: ${error.message}`,
            })
            .eq("id", item.id)
            .eq("status", "processing");

          if (statusError) {
            console.error(
              "[STATUS ERROR]",
              statusError.message
            );
          }

          console.warn(
            `[MESSAGE] ${item.id} requires manual reconciliation`
          );

          continue;
        }

        failed++;

        const { error: statusError } = await supabase
          .from("scheduled_messages")
          .update({
            status: "failed",
            last_error: error.message,
          })
          .eq("id", item.id)
          .eq("status", "processing");

        if (statusError) {
          console.error(
            "[STATUS ERROR]",
            statusError.message
          );
        }
      }
    }

    return res.json({
      success: true,
      checked_at: now,
      due_messages: messages.length,
      sent,
      failed,
      uncertain,
      skipped,
    });
  } catch (error) {
    console.error("[CRON ERROR]", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    isProcessing = false;
  }
});

export default router;
