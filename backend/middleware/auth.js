import jwt from "jsonwebtoken";
import { errorLogger } from "../agent_utils/shared/logger.js";

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      errorLogger.warn("Missing or invalid authorization header", {
        authHeader: authHeader ? "present" : "missing",
        component: "verifyToken",
      });
      return res.status(401).json({ error: "Authorization token required" });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);

    // Temporary verifyToken middleware check:
    console.log("JWT Payload:", decoded);
    console.log("Available fields:", Object.keys(decoded));

    // ✅ FIX: Extract user info properly from Supabase JWT
    req.userId = decoded.sub; // Supabase uses 'sub' for user ID
    req.userEmail = decoded.email; // Extract email
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role || "authenticated",
    };

    // ✅ FIX: Update logging middleware to use req.user.email
    errorLogger.debug("Token verified successfully", {
      userId: req.userId,
      userEmail: req.userEmail,
      role: decoded.role,
      component: "verifyToken",
    });

    next();
  } catch (error) {
    errorLogger.error("Token verification failed", error, {
      error_message: error.message,
      component: "verifyToken",
    });

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    } else if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }

    return res.status(401).json({ error: "Authentication failed" });
  }
};
