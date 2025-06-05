# 📦 Medical RAG Vector Uploader - Technical Breakdown

## 🎯 Core Purpose
This application serves as a secure platform for processing medical documents into vector embeddings for RAG (Retrieval Augmented Generation) applications. It combines document processing, vector embedding generation, and secure storage with granular access controls.

## 🏗 Monorepo Architecture

### Project Structure
```
/
├── frontend/           # React frontend application
│   ├── src/           # Frontend source code
│   ├── package.json   # Frontend dependencies
│   └── vite.config.ts # Vite configuration
├── backend/           # FastAPI backend application
│   ├── app/          # Backend source code
│   ├── requirements.txt # Python dependencies
│   └── Dockerfile    # Backend container definition
├── supabase/         # Supabase configurations
│   └── migrations/   # Database migrations
└── package.json      # Root package.json for monorepo management
```

### Monorepo Benefits
- **Unified Version Control**: Single repository for all project components
- **Shared Configuration**: Common tooling and settings
- **Simplified Dependencies**: Root-level package management
- **Coordinated Deployments**: Synchronized frontend and backend releases
- **Development Workflow**: Concurrent frontend and backend development

### Development Scripts
- `npm run install:all`: Install all dependencies (frontend and backend)
- `npm run dev`: Start both frontend and backend in development mode
- `npm run build`: Build the frontend application
- `npm run lint`: Run linting across the project

## 🏗 Architecture Deep Dive

### Frontend Architecture
- **React + Vite**: Optimized for development speed and production performance
- **Component Structure**:
  - `FileUpload`: Handles drag-and-drop file uploads with type validation
  - `DocumentList`: Displays uploaded documents with metadata
  - `Login`: Manages user authentication flow
- **State Management**: Local React state for UI, Supabase for data persistence
- **Authentication Flow**: JWT-based auth through Supabase, tokens stored in localStorage

### Backend Architecture (FastAPI)
- **Core Components**:
  - `DocumentProcessor`: Extracts text from various file formats (PDF, DOCX, TXT, MD)
  - `BioBERTEmbedder`: Generates 768-dimensional vectors using BioBERT
  - `SupabaseClient`: Handles storage and database operations
- **Security Layer**: JWT verification for protected endpoints
- **Error Handling**: Comprehensive error catching and logging

## 🚀 Deployment Architecture

### Backend Deployment (Render)
1. **Container Build**:
   ```bash
   cd backend
   docker build -t medical-rag-backend .
   ```

2. **Render Configuration**:
   - Service Type: Web Service
   - Environment: Docker
   - Build Command: `docker build -t medical-rag-backend .`
   - Start Command: `docker run -p $PORT:8000 medical-rag-backend`

3. **Environment Variables**:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   SUPABASE_BUCKET=your_bucket_name
   SUPABASE_JWT_SECRET=your_jwt_secret
   ```

### Frontend Deployment (Vercel)
1. **Build Setup**:
   - Build Command: `cd frontend && npm install && npm run build`
   - Output Directory: `frontend/dist`
   - Install Command: `npm run install:frontend`

2. **Environment Variables**:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_API_URL=your_backend_url
   ```

### Monorepo Deployment Strategy
1. **Separate Services**:
   - Frontend and backend are deployed as independent services
   - Connected through environment variables
   - Coordinated releases through Git tags

2. **CI/CD Pipeline**:
   - Triggered on main branch updates
   - Runs tests across both applications
   - Deploys backend first, then frontend
   - Validates end-to-end functionality

3. **Rollback Strategy**:
   - Version tracking through Git tags
   - Independent rollbacks possible for each service
   - Database migrations with reversion support

## 🔄 Data Flow

### Document Upload Flow
1. User drops file in `FileUpload` component
2. Frontend validates file type and size
3. File sent to FastAPI backend with JWT
4. Backend:
   - Verifies JWT and extracts user_id
   - Processes document through DocumentProcessor
   - Generates embedding via BioBERTEmbedder
   - Stores file in Supabase Storage
   - Saves metadata and embedding in documents table
5. Frontend updates UI with success/error

### Vector Search Flow
1. Query text converted to embedding
2. Similarity search using pgvector
3. Results filtered by relevance threshold
4. Metadata returned to frontend

## 🗃 Database Design

### documents Table
```sql
CREATE TABLE documents (
  id uuid PRIMARY KEY,
  filename text NOT NULL,
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(768),
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
```

### Security Policies
- Public read access for AI inference
- Write operations restricted to authenticated users
- Delete operations limited to document owners

### Indexing Strategy
```sql
CREATE INDEX documents_embedding_idx 
ON documents 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);
```

## 🔐 Security Architecture

### Authentication
- Supabase Auth handles user management
- JWT tokens for API authentication
- Token verification on backend endpoints

### Authorization
- Row Level Security (RLS) in Supabase
- User-specific document ownership tracking
- Public read access for AI operations

### File Security
- Secure file storage in Supabase Storage
- Access controlled through signed URLs
- File type validation on upload

## 🔍 Vector Search Implementation

### Embedding Generation
- BioBERT model for medical domain specificity
- 768-dimensional vectors
- Batch processing capability

### Similarity Search
- Cosine similarity via pgvector
- IVFFlat index for performance
- Configurable similarity threshold

## 📈 Performance Considerations

### Vector Search Optimization
- IVFFlat index with 100 lists
- Optimal for medium-sized document collections
- Sub-second query performance

### Document Processing
- Parallel processing capability
- Efficient text extraction
- Memory-conscious operations

### Frontend Performance
- React component optimization
- Lazy loading for large lists
- Efficient state management

## 🔄 Scaling Considerations

### Horizontal Scaling
- Stateless backend design
- Connection pooling for database
- Cache-friendly architecture

### Storage Scaling
- Efficient binary storage in Supabase
- Vector compression techniques
- Metadata optimization

### Search Scaling
- Index partitioning strategy
- Query optimization
- Result caching capability