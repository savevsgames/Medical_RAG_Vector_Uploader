import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class StaticFileService {
  constructor() {
    this.frontendDistPath = path.join(__dirname, '../../frontend/dist');
    this.indexHtmlPath = path.join(this.frontendDistPath, 'index.html');
  }

  setupStaticFiles(app) {
    // Serve static files from frontend/dist
    if (fs.existsSync(this.frontendDistPath)) {
      app.use('/', express.static(this.frontendDistPath));
      console.log('✅ Serving static files from:', this.frontendDistPath);
    } else {
      console.log('⚠️ Frontend dist directory not found:', this.frontendDistPath);
    }
  }

  setupSPAFallback(app) {
    // SPA fallback - serve index.html for all non-API routes
    app.get('*', (req, res) => {
      // Skip API routes
      if (req.path.startsWith('/api/') || 
          req.path.startsWith('/health') || 
          req.path.startsWith('/upload') ||
          req.path.startsWith('/chat') ||
          req.path.startsWith('/agent/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }

      // Serve index.html for all other routes (SPA routing)
      if (fs.existsSync(this.indexHtmlPath)) {
        res.sendFile(this.indexHtmlPath);
      } else {
        res.status(404).send('Frontend not built. Please run: cd frontend && npm run build');
      }
    });
  }
}

export const staticFileService = new StaticFileService();