import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { errorLogger } from '../agent_utils/errorLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StaticFileService {
  constructor() {
    this.frontendDistPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
  }

  setupStaticFiles(app) {
    // CRITICAL: Serve static files from frontend/dist BEFORE API routes
    if (fs.existsSync(this.frontendDistPath)) {
      errorLogger.info('Serving static files from frontend/dist', {
        path: this.frontendDistPath,
        files: fs.readdirSync(this.frontendDistPath)
      });
      
      // Serve static files
      app.use(express.static(this.frontendDistPath));
    } else {
      errorLogger.warn('Frontend dist directory not found', {
        expected_path: this.frontendDistPath,
        current_dir: __dirname
      });
    }
  }

  setupSPAFallback(app) {
    // CRITICAL: SPA Fallback Route - Must be LAST
    app.get('*', (req, res) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      
      const indexPath = path.join(this.frontendDistPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        // REDUCED LOGGING: Don't log every SPA fallback
        res.sendFile(indexPath);
      } else {
        errorLogger.error('index.html not found for SPA fallback', {
          requested_path: req.path,
          index_path: indexPath
        });
        res.status(404).send('Application not found');
      }
    });
  }
}

export const staticFileService = new StaticFileService();