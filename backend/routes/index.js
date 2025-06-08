import express from 'express';
import { healthRouter } from './health.js';
import { documentsRouter } from './documents.js';
import { chatRouter } from './chat.js';
import { verifyToken } from '../middleware/auth.js';
import { mountAgentRoutes } from '../agent_utils/index.js';

const router = express.Router();

export function setupRoutes(app) {
  // Health check (no auth required)
  app.use('/health', healthRouter);
  
  // Apply authentication middleware to protected routes
  app.use('/api/embed', verifyToken);
  app.use('/api/chat', verifyToken);
  app.use('/api/agent', verifyToken);
  app.use('/upload', verifyToken);
  
  // Legacy routes also need authentication
  app.use('/agent', verifyToken);
  app.use('/chat', verifyToken);
  
  // Mount protected routes
  app.use('/api', chatRouter);
  app.use('/', documentsRouter);
  
  // Mount agent routes (includes both new API and legacy)
  mountAgentRoutes(app);
}