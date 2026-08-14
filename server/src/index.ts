import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { apiRouter } from "./api/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../apps/web");
const mediaRoot = path.resolve(__dirname, "../../data/media");

const app = express();
const PORT = Number(process.env.PORT || 3000);
/** Containers / Cloud Run need 0.0.0.0; local dev can stay loopback */
const HOST =
  process.env.HOST ||
  (process.env.NODE_ENV === "production" || process.env.K_SERVICE
    ? "0.0.0.0"
    : "127.0.0.1");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health for Cloud Run / LB (no AI call)
app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, service: "star-trek-adventure" });
});

app.use("/api", apiRouter);
app.use("/media", express.static(mediaRoot));
app.use(express.static(webRoot));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/healthz")) {
    return next();
  }
  res.sendFile(path.join(webRoot, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log("");
  console.log("  Star Trek Adventure");
  console.log(`  Bridge online: http://${HOST}:${PORT}`);
  console.log(
    process.env.XAI_API_KEY?.trim()
      ? `  Narrator: LLM agent (${process.env.XAI_MODEL || "grok-4.5"})`
      : "  Narrator: MOCK (set XAI_API_KEY in .env for real LLM scenes)"
  );
  console.log("");
});
