import { errorLogger } from "../agent_utils/shared/logger.js";

export function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Skip logging for health checks to reduce noise
  if (req.path === "/health" || req.path === "/vite.svg") {
    return next();
  }

  // ✅ FIX: Extract user info properly AFTER verifyToken middleware runs
  const getUserInfo = () => {
    if (req.user?.email) return req.user.email;
    if (req.userEmail) return req.userEmail;
    if (req.userId) return `user:${req.userId}`;
    return "anonymous";
  };

  errorLogger.info("Request received", {
    method: req.method,
    path: req.path,
    user: getUserInfo(), // ✅ Now will show actual email
    ip: req.ip,
    userAgent: req.get("User-Agent")?.substring(0, 100),
    component: "RequestLogger",
  });

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 400 ? "error" : "info";

    errorLogger[logLevel]("Request completed", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      user: getUserInfo(), // ✅ Now will show actual email
      component: "RequestLogger",
    });
  });

  next();
}
