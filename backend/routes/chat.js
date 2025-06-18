import express from "express";
import { ChatService } from "../lib/services/ChatService.js";
import { config } from "../config/environment.js";
import { verifyToken } from "../middleware/auth.js";
import { errorLogger } from "../agent_utils/shared/logger.js";
import { AgentService } from "../agent_utils/core/agentService.js";
import { DocumentSearchService } from "../lib/services/DocumentSearchService.js";
import axios from "axios";

export function createChatRouter(supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== "function") {
    throw new Error("Invalid Supabase client provided to createChatRouter");
  }

  const router = express.Router();

  // Apply authentication to all chat routes
  router.use(verifyToken);

  // Initialize services with injected Supabase client
  const chatService = new ChatService(supabaseClient);
  const agentService = new AgentService(supabaseClient);
  const searchService = new DocumentSearchService(supabaseClient);

  // TxAgent Chat endpoint - UPDATED for new container API
  router.post("/chat", async (req, res) => {
    try {
      const { message, top_k = 5, temperature = 0.7 } = req.body || {};
      const userId = req.userId;

      if (!message || typeof message !== "string") {
        errorLogger.warn("Invalid TxAgent chat request - missing message", {
          user_id: userId,
          component: "TxAgentChat",
        });
        return res
          .status(400)
          .json({ error: "message is required and must be a string" });
      }

      const baseUrl = process.env.RUNPOD_EMBEDDING_URL;
      if (!baseUrl) {
        return res
          .status(503)
          .json({ error: "TxAgent container URL not configured" });
      }

      // Call TxAgent /chat endpoint with correct payload format
      const chatUrl = `${baseUrl}/chat`;

      const requestPayload = {
        query: message, // TxAgent expects 'query', not 'message'
        top_k: top_k,
        temperature: temperature,
      };

      errorLogger.debug("Calling TxAgent chat endpoint", {
        user_id: userId,
        chat_url: chatUrl,
        query_length: message.length,
        component: "TxAgentChat",
      });

      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          Authorization: req.headers.authorization, // Pass user's JWT
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
        timeout: 60000,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `TxAgent chat failed: ${response.status} - ${errorText}`
        );
      }

      const chatData = await response.json();

      errorLogger.success("TxAgent chat completed", {
        user_id: userId,
        response_length: chatData.response?.length || 0,
        sources_count: chatData.sources?.length || 0,
        component: "TxAgentChat",
      });

      // Return in expected format
      res.json({
        response: chatData.response,
        sources: chatData.sources || [],
        agent_id: "txagent",
        processing_time: chatData.processing_time || null,
        model: "BioBERT + GPT",
        tokens_used: null,
        timestamp: new Date().toISOString(),
        status: "success",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "TxAgent chat failed";

      errorLogger.error("TxAgent chat request failed", error, {
        user_id: req.userId,
        error_message: errorMessage,
        component: "TxAgentChat",
      });

      res.status(500).json({
        error: "Chat request failed",
        details: errorMessage,
      });
    }
  });

  // OpenAI Chat endpoint - Enhanced fallback option
  router.post("/openai-chat", async (req, res) => {
    try {
      const { message } = req.body;
      const userId = req.userId;

      if (!message || typeof message !== "string") {
        errorLogger.warn("Invalid OpenAI chat request - missing message", {
          user_id: userId,
          component: "OpenAIChat",
        });
        return res.status(400).json({ error: "Message is required" });
      }

      if (!config.openai.apiKey) {
        errorLogger.warn("OpenAI chat service not configured", {
          user_id: userId,
          component: "OpenAIChat",
        });
        return res.status(503).json({
          error: "OpenAI chat service not configured",
          details:
            "OpenAI API key is not configured. Please use TxAgent or configure OpenAI.",
        });
      }

      errorLogger.info("Processing OpenAI chat request", {
        user_id: userId,
        message_length: message.length,
        message_preview: message.substring(0, 100),
        component: "OpenAIChat",
      });

      // Use ChatService for OpenAI RAG processing
      const result = await chatService.processQuery(userId, message);

      errorLogger.success("OpenAI chat completed", {
        user_id: userId,
        response_length: result.response.length,
        sources_count: result.sources.length,
        component: "OpenAIChat",
      });

      res.json({
        response: result.response,
        sources: result.sources,
        agent_id: "openai",
        processing_time: null,
        model: "GPT-4",
        tokens_used: null,
        timestamp: new Date().toISOString(),
        status: "success",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      errorLogger.error("OpenAI chat request failed", error, {
        user_id: req.userId,
        error_message: errorMessage,
        error_stack: error.stack,
        component: "OpenAIChat",
      });

      res.status(500).json({
        error: "OpenAI chat processing failed",
        details: errorMessage,
      });
    }
  });

  return router;
}

// Legacy export for backward compatibility
export const chatRouter = createChatRouter;
