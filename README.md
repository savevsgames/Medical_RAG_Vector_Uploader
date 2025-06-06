# Medical RAG Vector Uploader

A full-stack application for uploading medical documents, generating embeddings, and managing intelligent RAG agents for medical query assistance.

## Project Structure

This is a unified Node.js application with:

- `frontend/`: React application for document upload and agent management
- `backend/`: Express.js API server for document processing and agent orchestration
- `supabase/`: Database migrations and configurations

## Quick Start

### Prerequisites
- Node.js 18+
- Supabase project with vector extension enabled

### Installation

```bash
# Install all dependencies
npm install

# Copy environment files
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Update .env files with your Supabase credentials
```

### Development

```bash
# Start both frontend and backend
npm run dev

# Or start individually:
npm run dev:frontend  # Frontend only (port 5173)
npm run dev:backend   # Backend only (port 8000)
```

### Environment Variables

#### Frontend (.env in root and frontend/.env)
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:8000
```

#### Backend (backend/.env)
```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_service_role_key
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
PORT=8000
```

## Features

### Current
- ✅ User authentication via Supabase Auth
- ✅ Document upload and storage
- ✅ Vector embeddings for RAG
- ✅ Agent session management
- ✅ Secure user-specific data access

### Planned
- 🔄 Document text extraction (PDF, DOCX, TXT, MD)
- 🔄 BioBERT embedding generation
- 🔄 Intelligent query processing
- 🔄 Real-time agent communication
- 🔄 Voice synthesis integration

## API Endpoints

### Health
- `GET /health` - Service health check

### Documents
- `POST /upload` - Upload and process documents

### Agents
- `POST /agent/start` - Initialize user agent
- `POST /agent/stop` - Terminate user agent
- `GET /agent/status` - Check agent status

## Database Schema

### Tables
- `documents` - Stores uploaded documents and embeddings
- `agents` - Manages user agent sessions
- `embedding_jobs` - Tracks background processing jobs

## Development Notes

This application has been converted from a Python/FastAPI backend to a unified Node.js stack for simplified deployment and development. The core functionality remains the same while providing better integration and easier maintenance.