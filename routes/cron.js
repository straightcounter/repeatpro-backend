
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import supabase from "../config/supabase.js";
import "dotenv/config";

const router = Router();

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

  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (error) throw error;

    console.log(`Found ${data.length} due messages`);

    for (const message of data) {
      console.log("Scheduled message:", message);
    }

    return res.json({
      success: true,
      checked_at: now,
      due_messages: data.length,
    });
  } catch (error) {
    console.error("Cron processing error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch scheduled messages",
    });
  }
});

export default router;
