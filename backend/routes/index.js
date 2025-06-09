import express from 'express';
import { healthRouter } from './health.js';
import { documentsRouter } from './documents.js';
import { chatRouter } from './chat.js';
import { mountAgentRoutes } from '../agent_utils/index.js';

const router = express.Router();

export function setupRoutes(app) {
  // Health check (no auth required)
  app.use('/health', healthRouter);
  
  // Mount protected routes - auth is now handled within each router
  app.use('/api', chatRouter);
  app.use('/', documentsRouter);
  
  // Mount agent routes (includes both new API and legacy)
  mountAgentRoutes(app);
}