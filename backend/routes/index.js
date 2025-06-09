import express from 'express';
import healthRoutes from './health.js';
import documentsRoutes from './documents.js';
import chatRoutes from './chat.js';
import { router as agentRoutes } from '../agent_utils/routes/agentRoutes.js';
import { router as containerRoutes } from '../agent_utils/routes/containerRoutes.js';

const router = express.Router();

// Mount all route modules
router.use('/health', healthRoutes);
router.use('/documents', documentsRoutes);
router.use('/chat', chatRoutes);
router.use('/agent', agentRoutes);
router.use('/', containerRoutes); // Mount container routes at root level to handle /embed

export default router;