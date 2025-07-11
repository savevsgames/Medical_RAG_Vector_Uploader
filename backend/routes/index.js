import express from "express";
import fetch from "node-fetch"; // ✅ Add this if using Node < 18
import { healthRouter } from "./health.js";
import { createDocumentsRouter } from "./documents.js";
import { createChatRouter } from "./chat.js";
import { createMedicalConsultationRouter } from "./medicalConsultation.js";
import { createMedicalProfileRouter } from "./medicalProfile.js"; // Phase 2
import { createVoiceGenerationRouter } from "./voiceGeneration.js"; // Phase 2
import { createVoiceServicesRouter } from "./voiceServices.js"; // ✅ NEW: Voice services for mobile app
import { createConversationWebSocketRouter } from "./conversationWebSocket.js"; // ✅ NEW: Conversation WebSocket
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
  const medicalConsultationRouter = createMedicalConsultationRouter(supabaseClient);
  const medicalProfileRouter = createMedicalProfileRouter(supabaseClient); // Phase 2
  const voiceGenerationRouter = createVoiceGenerationRouter(supabaseClient); // Phase 2
  const voiceServicesRouter = createVoiceServicesRouter(supabaseClient); // ✅ NEW: Voice services
  const conversationWebSocketRouter = createConversationWebSocketRouter(supabaseClient); // ✅ NEW: Conversation WebSocket

  // FIXED: Clean route structure - no legacy routes
  // Mount protected routes - auth is now handled within each router
  app.use("/api", chatRouter); // /api/chat, /api/openai-chat
  app.use("/api", medicalConsultationRouter); // /api/medical-consultation
  app.use("/api", medicalProfileRouter); // Phase 2: /api/medical-profile, /api/symptoms, /api/treatments
  app.use("/api", voiceGenerationRouter); // Phase 2: /api/generate-voice, /api/voices
  app.use("/api/voice", voiceServicesRouter); // ✅ NEW: /api/voice/tts, /api/voice/transcribe, /api/voice/voices
  app.use("/api", conversationWebSocketRouter); // ✅ NEW: /api/conversation/start, /api/conversation/:sessionId/status
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
      "POST /api/medical-consultation", // Phase 1
      "GET /api/medical-profile", // Phase 2
      "POST /api/medical-profile", // Phase 2
      "GET /api/symptoms", // Phase 2
      "POST /api/symptoms", // Phase 2
      "GET /api/treatments", // Phase 2
      "POST /api/treatments", // Phase 2
      "POST /api/generate-voice", // Phase 2
      "GET /api/voices", // Phase 2
      "POST /api/voice/tts", // ✅ NEW: Mobile app TTS
      "POST /api/voice/transcribe", // ✅ NEW: Mobile app STT
      "GET /api/voice/voices", // ✅ NEW: Mobile app voice list
      "POST /api/embed",
      "POST /api/agent/start",
      "POST /api/agent/stop",
      "GET /api/agent/status",
      "POST /api/agent/health-check",
      "POST /api/conversation/start", // ✅ NEW: Start conversation session
      "GET /api/conversation/:sessionId/status", // ✅ NEW: Get conversation status
      "POST /api/conversation/:sessionId/end", // ✅ NEW: End conversation session
      "GET /api/conversation/active", // ✅ NEW: Get active conversations
      "WS /conversation/stream/:sessionId", // ✅ NEW: WebSocket stream
    ],
    legacy_routes_removed: true,
  });
}

export default setupRoutes;

export { ChatService } from "../lib/services/ChatService.js"; // ✅ Keep this
// export { DocumentProcessingService } from './DocumentProcessingService.js';  // ❌ Removed
// export { EmbeddingService } from './EmbeddingService.js';                    // ❌ Removed