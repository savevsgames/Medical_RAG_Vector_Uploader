import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorLogger } from '../agent_utils/shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StaticFileService {
  constructor() {
    this.frontendDistPath = path.join(__dirname, '../../frontend/dist');
  }

  setupStaticFiles(app) {
    try {
      // Serve static files from frontend/dist
      app.use(express.static(this.frontendDistPath));
      
      // Log available files for debugging
      const fs = await import('fs');
      if (fs.existsSync(this.frontendDistPath)) {
        const files = fs.readdirSync(this.frontendDistPath);
        errorLogger.info('Serving static files from frontend/dist', {
          path: this.frontendDistPath,
          files: files
        });
      } else {
        errorLogger.warn('Frontend dist directory not found', {
          path: this.frontendDistPath
        });
      }
    } catch (error) {
      errorLogger.error('Failed to setup static file serving', error);
    }
  }

  setupSPAFallback(app) {
    try {
      // SPA fallback - serve index.html for all non-API routes
      app.get('*', (req, res, next) => {
        // Skip API routes
        if (req.path.startsWith('/api/') || 
            req.path.startsWith('/health') || 
            req.path.startsWith('/upload') ||
            req.path.startsWith('/agent/') ||
            req.path.startsWith('/chat/')) {
          return next();
        }

        const indexPath = path.join(this.frontendDistPath, 'index.html');
        res.sendFile(indexPath, (err) => {
          if (err) {
            errorLogger.error('Failed to serve SPA fallback', err);
            res.status(500).send('Server Error');
          }
        });
      });

      errorLogger.info('SPA fallback configured for frontend routing');
    } catch (error) {
      errorLogger.error('Failed to setup SPA fallback', error);
    }
  }
}

export const staticFileService = new StaticFileService();