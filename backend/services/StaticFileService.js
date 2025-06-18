import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { errorLogger } from "../agent_utils/shared/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StaticFileService {
  constructor() {
    // ✅ Consistent naming with your existing code
    this.frontendDistPath = path.join(__dirname, "../../frontend/dist");
    this.indexPath = path.join(this.frontendDistPath, "index.html");

    // ✅ Add validation at construction
    this.validatePaths();
  }

  async validatePaths() {
    try {
      // Check if paths exist during initialization
      const fs = await import("fs");
      if (!fs.existsSync(this.frontendDistPath)) {
        errorLogger.warn("Frontend dist directory not found", {
          frontendDistPath: this.frontendDistPath,
          component: "StaticFileService",
        });
      }
      if (!fs.existsSync(this.indexPath)) {
        errorLogger.warn("Frontend index.html not found", {
          indexPath: this.indexPath,
          component: "StaticFileService",
        });
      }
    } catch (error) {
      errorLogger.error("Failed to validate static file paths", error, {
        component: "StaticFileService",
      });
    }
  }

  setupStaticFiles(app) {
    try {
      // ✅ Serve static files with optimized caching
      app.use(
        express.static(this.frontendDistPath, {
          maxAge: "1d", // Cache static assets for 1 day
          etag: true,
          lastModified: true,
          // ✅ Add compression support
          setHeaders: (res, path) => {
            if (path.endsWith(".html")) {
              // Don't cache HTML files
              res.setHeader("Cache-Control", "no-cache");
            }
          },
        })
      );

      errorLogger.success("Static file serving configured", {
        frontendDistPath: this.frontendDistPath,
        cacheMaxAge: "1d",
        component: "StaticFileService",
      });
    } catch (error) {
      errorLogger.error("Failed to setup static file serving", error, {
        frontendDistPath: this.frontendDistPath,
        component: "StaticFileService",
      });
    }
  }

  setupSPAFallback(app) {
    try {
      // ✅ SPA fallback - MUST be the last route
      app.get("*", (req, res) => {
        // ✅ Comprehensive API route exclusion
        const apiRoutes = ["/api/", "/health", "/upload", "/agent/"];
        const isApiRoute = apiRoutes.some((route) =>
          req.path.startsWith(route)
        );

        if (isApiRoute) {
          errorLogger.debug("API route not found", {
            path: req.path,
            method: req.method,
            availableRoutes: "Check route configuration",
            component: "StaticFileService",
          });

          return res.status(404).json({
            error: "API endpoint not found",
            path: req.path,
            method: req.method,
          });
        }

        // ✅ Enhanced logging for SPA fallback
        errorLogger.debug("SPA fallback triggered", {
          path: req.path,
          method: req.method,
          userAgent: req.get("User-Agent")?.substring(0, 100),
          referer: req.get("Referer"),
          isDirectAccess: !req.get("Referer"),
          component: "StaticFileService",
        });

        // ✅ Serve index.html for all frontend routes with better error handling
        res.sendFile(this.indexPath, (err) => {
          if (err) {
            errorLogger.error("Failed to serve index.html", err, {
              path: req.path,
              indexPath: this.indexPath,
              errorCode: err.code,
              errorMessage: err.message,
              component: "StaticFileService",
            });

            // ✅ More specific error responses
            if (err.code === "ENOENT") {
              res.status(500).json({
                error: "Application files not found",
                details: "Frontend build files are missing",
              });
            } else {
              res.status(500).json({
                error: "Failed to serve application",
                details: "Could not load index.html",
              });
            }
          } else {
            // ✅ Log successful SPA serves (useful for debugging)
            errorLogger.debug("SPA route served successfully", {
              path: req.path,
              component: "StaticFileService",
            });
          }
        });
      });

      errorLogger.success("SPA fallback routing configured", {
        indexPath: this.indexPath,
        handledRoutes: "All non-API routes → index.html",
        component: "StaticFileService",
      });
    } catch (error) {
      errorLogger.error("Failed to setup SPA fallback", error, {
        indexPath: this.indexPath,
        component: "StaticFileService",
      });
    }
  }

  // ✅ Add utility method for health checks
  getStatus() {
    const fs = require("fs");
    return {
      frontendDistExists: fs.existsSync(this.frontendDistPath),
      indexHtmlExists: fs.existsSync(this.indexPath),
      frontendDistPath: this.frontendDistPath,
      indexPath: this.indexPath,
    };
  }
}

export const staticFileService = new StaticFileService();
