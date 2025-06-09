import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorLogger } from '../agent_utils/shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StaticFileService {
  constructor() {
    this.frontendDistPath = path.join(__dirname, '../../frontend/dist');
    this.indexPath = path.join(this.frontendDistPath, 'index.html');
  }

  setupStaticFiles(app) {
    try {
      // Serve static files from frontend/dist
      app.use(express.static(this.frontendDistPath, {
        maxAge: '1d', // Cache static assets for 1 day
        etag: true,
        lastModified: true
      }));

      errorLogger.info('Static file serving configured', {
        frontendDistPath: this.frontendDistPath,
        component: 'StaticFileService'
      });
    } catch (error) {
      errorLogger.error('Failed to setup static file serving', error, {
        frontendDistPath: this.frontendDistPath,
        component: 'StaticFileService'
      });
    }
  }

  setupSPAFallback(app) {
    try {
      // SPA fallback - MUST be the last route
      app.get('*', (req, res) => {
        // Don't serve index.html for API routes
        if (req.path.startsWith('/api/') || 
            req.path.startsWith('/health') || 
            req.path.startsWith('/upload') ||
            req.path.startsWith('/agent/') ||
            req.path.startsWith('/chat/')) {
          return res.status(404).json({ 
            error: 'API endpoint not found',
            path: req.path 
          });
        }

        // Log SPA fallback for debugging
        errorLogger.debug('SPA fallback triggered', {
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent')?.substring(0, 100),
          component: 'StaticFileService'
        });

        // Serve index.html for all non-API routes
        res.sendFile(this.indexPath, (err) => {
          if (err) {
            errorLogger.error('Failed to serve index.html', err, {
              path: req.path,
              indexPath: this.indexPath,
              component: 'StaticFileService'
            });
            res.status(500).json({ 
              error: 'Failed to serve application',
              details: 'Could not load index.html'
            });
          }
        });
      });

      errorLogger.info('SPA fallback routing configured', {
        indexPath: this.indexPath,
        component: 'StaticFileService'
      });
    } catch (error) {
      errorLogger.error('Failed to setup SPA fallback', error, {
        indexPath: this.indexPath,
        component: 'StaticFileService'
      });
    }
  }
}

export const staticFileService = new StaticFileService();