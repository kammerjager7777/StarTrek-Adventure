import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { apiRouter } from "./api/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../apps/web");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api", apiRouter);
app.use(express.static(webRoot));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(webRoot, "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log("");
  console.log("  Star Trek Adventure — Phase 1");
  console.log(`  Bridge online: http://${HOST}:${PORT}`);
  console.log(
    process.env.XAI_API_KEY
      ? "  xAI: configured (narration enrichment on)"
      : "  xAI: not configured (mock GM rules engine — set XAI_API_KEY in .env)"
  );
  console.log("");
});
