# Medical RAG Vector Uploader

A full-stack application for uploading medical documents, generating embeddings, and storing them in Supabase for RAG applications.

## Project Structure

This monorepo contains:

- `backend/`: FastAPI application for document processing and vector embeddings
- `frontend/`: React application for document upload and management

## Getting Started

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

Create `.env` files in both backend and frontend directories. See `.env.example` in each directory for required variables.