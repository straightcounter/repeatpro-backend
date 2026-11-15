import express from "express";
import "dotenv/config";
import cronRouter from "./routes/cron.js";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "RepeatPro Automation API is running",
  });
});

app.use("/api/cron", cronRouter);

const PORT = process.env.PORT || 3001;

app.listen(PORT, "127.0.0.1", () => {
  console.log(`RepeatPro API running on port ${PORT}`);
});