import express from "express";
import fetch from "node-fetch"; // ✅ Add this if using Node < 18
import { healthRouter } from "./health.js";
import { createDocumentsRouter } from "./documents.js";
import { createChatRouter } from "./chat.js";
import { mountAgentRoutes } from "../agent_utils/index.js";
import { verifyToken } from "../middleware/auth.js";
import { errorLogger } from "../agent_utils/shared/logger.js";

const router = express.Router();

export function setupRoutes(app, supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== "function") {
    throw new Error("Invalid Supabase client provided to setupRoutes");
  }

  errorLogger.info("Setting up routes with clean API structure");

  // Health check (no auth required)
  app.use("/health", healthRouter);

  // FIXED: Handle vite.svg requests to prevent 401 errors
  app.get("/vite.svg", (req, res) => {
    errorLogger.debug("Serving vite.svg placeholder", {
      ip: req.ip,
      userAgent: req.get("User-Agent")?.substring(0, 100),
      component: "StaticAssets",
    });
    res.sendStatus(200);
  });

  // Create routers with Supabase client dependency injection
  const documentsRouter = createDocumentsRouter(supabaseClient);
  const chatRouter = createChatRouter(supabaseClient);

  // FIXED: Clean route structure - no legacy routes
  // Mount protected routes - auth is now handled within each router
  app.use("/api", chatRouter); // /api/chat, /api/openai-chat
  app.use("/", documentsRouter); // /upload (legacy for compatibility)

  // FIXED: Mount agent routes ONLY (no legacy routes)
  // This function handles mounting agent routes at /api/agent path
  mountAgentRoutes(app, supabaseClient);

  // Simple proxy to TxAgent container
  app.post("/api/embed", verifyToken, async (req, res) => {
    try {
      const response = await fetch(
        `${process.env.RUNPOD_EMBEDDING_URL}/embed`,
        {
          method: "POST",
          headers: {
            Authorization: req.headers.authorization,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(req.body),
        }
      );

      const result = await response.json();
      res.json(result);
    } catch (error) {
      res
        .status(500)
        .json({ error: "TxAgent embed failed", details: error.message });
    }
  });

  errorLogger.success("Routes setup completed with clean structure:", {
    routes: [
      "GET /health",
      "GET /vite.svg (placeholder)",
      "POST /upload",
      "POST /api/chat",
      "POST /api/openai-chat",
      "POST /api/embed",
      "POST /api/agent/start",
      "POST /api/agent/stop",
      "GET /api/agent/status",
      "POST /api/agent/health-check",
    ],
    legacy_routes_removed: true,
  });
}

export default setupRoutes;

export { ChatService } from "../lib/services/ChatService.js"; // ✅ Keep this
// export { DocumentProcessingService } from './DocumentProcessingService.js';  // ❌ Removed
// export { EmbeddingService } from './EmbeddingService.js';                    // ❌ Removed
