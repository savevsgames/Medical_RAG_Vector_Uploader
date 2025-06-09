import express from 'express';
import { healthRouter } from './health.js';
import { createDocumentsRouter } from './documents.js';
import { createChatRouter } from './chat.js';
import { mountAgentRoutes } from '../agent_utils/index.js';
import { router as containerRouter } from '../agent_utils/routes/containerRoutes.js';

const router = express.Router();

export function setupRoutes(app, supabaseClient) {
  // Validate Supabase client
  if (!supabaseClient || typeof supabaseClient.from !== 'function') {
    throw new Error('Invalid Supabase client provided to setupRoutes');
  }

  // Health check (no auth required)
  app.use('/health', healthRouter);
  
  // Create routers with Supabase client dependency injection
  const documentsRouter = createDocumentsRouter(supabaseClient);
  const chatRouter = createChatRouter(supabaseClient);
  
  // Mount container routes under /api path
  app.use('/api', containerRouter);
  
  // Mount protected routes - auth is now handled within each router
  app.use('/api', chatRouter);
  app.use('/', documentsRouter);
  
  // Mount agent routes (includes both new API and legacy)
  mountAgentRoutes(app, supabaseClient);
}