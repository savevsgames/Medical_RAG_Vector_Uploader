import express from "express";
import { config, validateConfig } from "./config/environment.js";
import { database, supabase } from "./config/database.js";
import { corsMiddleware, optionsHandler } from "./middleware/cors.js";
import { requestLogger } from "./middleware/logging.js";
import setupRoutes from "./routes/index.js";
import { staticFileService } from "./services/StaticFileService.js";
import { errorLogger } from "./agent_utils/shared/logger.js";

function startServer() {
  const app = express();

  console.log(">>> ENV PORT:", process.env.PORT);
  console.log(">>> CONFIG PORT:", config.port);

  // Enhanced startup logging
  errorLogger.info("🚀 Medical RAG Server starting up...");
  errorLogger.info("Environment check", {
    node_version: process.version,
    port: config.port,
    environment: config.nodeEnv,
  });

  // Validate configuration first
  try {
    validateConfig();
    errorLogger.success("Configuration validation passed");
  } catch (error) {
    errorLogger.error("Configuration validation failed", error);
    process.exit(1);
  }

  // Initialize database connection (synchronous)
  try {
    const result = database.initialize();
    errorLogger.success(
      "Database client initialized with service_role authentication"
    );

    // Log service role confirmation
    errorLogger.info("Supabase client configuration", {
      url: config.supabase.url,
      using_service_role: true,
      has_service_key: !!config.supabase.serviceKey,
      service_key_length: config.supabase.serviceKey?.length || 0,
    });
  } catch (error) {
    errorLogger.error("Failed to initialize database client", error);
    process.exit(1);
  }

  // CRITICAL FIX: Validate the Supabase client before using it
  let supabaseClient;
  try {
    // First, try to get the client from the database module
    supabaseClient = database.getClient();

    // If that doesn't work, try the direct import
    if (!supabaseClient || typeof supabaseClient.from !== "function") {
      supabaseClient = supabase;
    }

    // Final validation
    if (!supabaseClient || typeof supabaseClient.from !== "function") {
      throw new Error(
        "Supabase client is not properly initialized or exported"
      );
    }

    errorLogger.success("Supabase client validated successfully", {
      hasFromMethod: typeof supabaseClient.from === "function",
      hasAuthMethod: typeof supabaseClient.auth === "object",
      clientType: supabaseClient.constructor?.name || "unknown",
    });
  } catch (error) {
    errorLogger.error("Failed to validate Supabase client", error);
    process.exit(1);
  }

  // Test database connection (async, but non-blocking)
  database
    .healthCheck()
    .then((healthCheck) => {
      if (healthCheck.healthy) {
        errorLogger.success("Database connection test passed", {
          auth_role: healthCheck.auth_role || "service_role",
        });
      } else {
        errorLogger.error(
          "Database connection test failed",
          new Error(healthCheck.message)
        );
        // Don't exit - let the server start but log the issue
      }
    })
    .catch((error) => {
      errorLogger.error("Database connection test failed", error);
      // Don't exit - let the server start but log the issue
    });

  // Middleware setup
  app.use(corsMiddleware);
  app.options("*", optionsHandler);

  // ENHANCED: Increase JSON body limit for larger document metadata
  app.use(express.json({ limit: "10mb" }));
  errorLogger.info("Express JSON body limit set to 10mb");

  app.use(requestLogger);

  // Setup static file serving
  staticFileService.setupStaticFiles(app);

  // CRITICAL FIX: Pass the validated Supabase client
  try {
    setupRoutes(app, supabaseClient);
    errorLogger.success(
      "Routes setup completed with service_role Supabase client"
    );
  } catch (error) {
    errorLogger.error("Failed to setup routes", error);
    process.exit(1);
  }

  // Setup SPA fallback (must be last)
  staticFileService.setupSPAFallback(app);

  // Error handling middleware
  app.use((error, req, res, next) => {
    errorLogger.error("Unhandled server error", error, {
      user_id: req.userId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      user_agent: req.get("User-Agent")?.substring(0, 100),
      error_stack: error.stack,
    });

    res.status(500).json({
      error: "Internal server error",
      details: config.isDevelopment ? error.message : "Server error occurred",
    });
  });

  // Graceful shutdown handling
  process.on("SIGTERM", () => {
    errorLogger.info("SIGTERM received, shutting down gracefully");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    errorLogger.info("SIGINT received, shutting down gracefully");
    process.exit(0);
  });

  process.on("uncaughtException", (error) => {
    errorLogger.error("Uncaught exception", error, {
      error_stack: error.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    errorLogger.error("Unhandled rejection", reason, {
      promise: promise.toString(),
      reason_stack: reason?.stack,
    });
    process.exit(1);
  });

  // Start server
  app.listen(config.port, () => {
    errorLogger.success("🚀 Medical RAG Server running", {
      port: config.port,
      health_check: `http://localhost:${config.port}/health`,
      environment: config.nodeEnv,
      json_limit: "10mb",
      supabase_auth: "service_role",
    });

    errorLogger.info("🔧 Services configured:");
    errorLogger.connectionCheck("Database", database.isInitialized());
    errorLogger.connectionCheck("Supabase Auth", "service_role");

    errorLogger.info("📚 Available endpoints (LEGACY ROUTES REMOVED):");
    errorLogger.info("  - GET  /health (Health check)");
    errorLogger.info("  - POST /upload (Document upload)");
    errorLogger.info("  - POST /api/chat (Chat with TxAgent)");
    errorLogger.info("  - POST /api/openai-chat (Chat with OpenAI RAG)");
    errorLogger.info("  - POST /api/agent/start (Start TxAgent)");
    errorLogger.info("  - POST /api/agent/stop (Stop TxAgent)");
    errorLogger.info("  - GET  /api/agent/status (Agent status)");
    errorLogger.info(
      "  - POST /api/agent/health-check (Detailed health check)"
    );
    errorLogger.info("  - POST /api/embed (TxAgent embedding proxy)");
    errorLogger.info("  - GET  /* (SPA fallback to index.html)");
  });
}

// Start the server (synchronous call)
try {
  startServer();
} catch (error) {
  errorLogger.error("Failed to start server", error);
  process.exit(1);
}
