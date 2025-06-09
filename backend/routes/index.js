import express from 'express';
import { createHealthRouter } from './health.js';
import { createDocumentsRouter } from './documents.js';
import { createChatRouter } from './chat.js';
import { router as agentRoutes } from '../agent_utils/routes/agentRoutes.js';
import { router as containerRoutes } from '../agent_utils/routes/containerRoutes.js';

export function createApiRouter(supabaseClient) {
  const router = express.Router();

  // Create routers with Supabase client
  const healthRouter = createHealthRouter ? createHealthRouter(supabaseClient) : express.Router();
  const documentsRouter = createDocumentsRouter(supabaseClient);
  const chatRouter = createChatRouter(supabaseClient);

  // Mount all route modules
  router.use('/health', healthRouter);
  router.use('/documents', documentsRouter);
  router.use('/chat', chatRouter);
  router.use('/agent', agentRoutes);
  router.use('/', containerRoutes); // Mount container routes at root level to handle /embed

  return router;
}

// Keep backward compatibility for any direct imports
export default function setupRoutes(app, supabaseClient) {
  const apiRouter = createApiRouter(supabaseClient);
  app.use('/api', apiRouter);
}