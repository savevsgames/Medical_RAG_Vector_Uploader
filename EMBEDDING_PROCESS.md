# EMBED_PROCESSES.md - Embedding and Chat Flow Explanation

This document details the embedding generation and chat interaction processes within the Medical RAG Vector Uploader system, focusing on the roles of the frontend, backend, Supabase, and the TxAgent container, with particular attention to routing and Row Level Security (RLS).

## 1. Document Upload and Embedding Process

This process handles the ingestion of new medical documents, extracting their content, generating embeddings, and storing them in Supabase.

### 1.1. Frontend Interaction

*   **User Action**: A user navigates to the "Documents" page and uploads a file (PDF, DOCX, TXT, MD) using the drag-and-drop interface.
*   **Authentication**: The frontend retrieves the user's active session and JWT token from Supabase.
*   **API Call**: The frontend sends the selected file as `FormData` to the backend's `/upload` endpoint. The user's JWT is included in the `Authorization` header (`Bearer <jwt_token>`).

### 1.2. Backend Processing (`backend/routes/documents.js`)

The backend acts as an orchestrator, handling file processing, embedding generation, and database insertion.

*   **Route**: `POST /upload`
*   **Authentication**: The `verifyToken` middleware intercepts the request, validates the JWT, and extracts the `user_id` from the token. This `user_id` is attached to the `req` object.
*   **Text Extraction & Chunking**:
    *   The `DocumentProcessingService` extracts raw text from the uploaded file.
    *   The extracted text is then split into smaller, manageable "chunks" (e.g., 2000 characters with 200 characters overlap).
*   **Embedding Generation (for each chunk)**:
    *   The `EmbeddingService` is invoked for each text chunk.
    *   **Primary Method (TxAgent)**: The backend first attempts to generate embeddings by calling the TxAgent container's `/embed` endpoint.
        *   The `Authorization` header (containing the user's JWT) from the incoming request is passed directly to the TxAgent container.
        *   **Dimension Validation**: The backend strictly validates that the returned embedding is 768-dimensional (as required for BioBERT and the `vector(768)` column in Supabase). If the TxAgent returns a different dimension (e.g., 1536D from an OpenAI model), the backend will throw an error, indicating a misconfiguration of the TxAgent container.
    *   **Fallback Method (OpenAI)**: If the TxAgent is not configured, is unreachable, or returns an invalid embedding, the backend falls back to using OpenAI's `text-embedding-ada-002` model. (Note: OpenAI embeddings are 1536-dimensional, which are incompatible with the current `documents` table schema designed for 768-dimensional BioBERT embeddings. This fallback is primarily for testing/development and would cause an error during database insertion if the dimension validation is strict).
*   **Database Insertion**:
    *   For each successfully embedded chunk, the backend constructs a record containing:
        *   `id` (UUID)
        *   `filename`
        *   `content` (the text chunk)
        *   `embedding` (the 768-dimensional vector)
        *   `metadata` (including original file metadata and chunk-specific info)
        *   `user_id` (crucially, this is set to `req.userId` obtained from the authenticated JWT)
    *   This record is then inserted into the `public.documents` table in Supabase.

### 1.3. TxAgent Container Interaction

The TxAgent container, when acting as an embedding service, receives requests from the backend.

*   **Endpoint**: `POST /embed`
*   **Request**: `{"text": "Patient presents with chest pain and dyspnea", "normalize": true}`
*   **Headers**: `Authorization: Bearer <user_jwt_token>`, `X-API-Key: <runpod_key>`
*   **Response**: `{"embedding": [0.1234, -0.5678, ...], "dimensions": 768, "model": "BioBERT", ...}`
*   **RLS/JWT Handling**: The container is expected to handle the JWT for authentication of the request itself. However, for document embedding, the container does not directly interact with Supabase for RLS enforcement; the backend handles the `user_id` assignment during insertion.

### 1.4. Supabase (`public.documents` table)

Supabase stores the document chunks and enforces RLS.

*   **Schema**: The `documents` table has an `embedding` column of type `vector(768)`.
*   **Row Level Security (RLS) for Document Uploads**:
    *   `INSERT` Policy: `Users can only upload as themselves` (`auth.uid() = user_id`). This policy ensures that a user can only insert documents where the `user_id` column matches their authenticated UID. The backend explicitly sets `user_id: req.userId`, ensuring compliance.
    *   `UPDATE` and `DELETE` policies also enforce ownership (`auth.uid() = user_id`).

## 2. Chat Query and Retrieval-Augmented Generation (RAG) Process

This process involves using a user's query to find relevant document chunks and then generating a response.

### 2.1. Frontend Interaction

*   **User Action**: A user types a question in the chat interface.
*   **Agent Selection**: The user selects either "TxAgent" or "OpenAI" as the AI agent. This document focuses on the TxAgent flow.
*   **Authentication**: The frontend retrieves the user's active session and JWT token.
*   **API Call**: The frontend sends the user's message to the backend's `/api/chat` endpoint. The user's JWT is included in the `Authorization` header.

### 2.2. Backend Processing (`backend/routes/chat.js`)

The backend orchestrates the RAG process, involving the TxAgent container and Supabase.

*   **Route**: `POST /api/chat`
*   **Authentication**: The `verifyToken` middleware validates the JWT and extracts the `user_id`.
*   **TxAgent Session Retrieval**: The backend queries the `public.agents` table to find the active TxAgent session for the current `user_id`. This is crucial to get the `runpod_endpoint` of the user's specific TxAgent container.
    *   **RLS on `agents` table**: The `agents` table has RLS policies (`Users can manage own agents`) that ensure only the authenticated user's agent sessions are retrieved.
*   **Query Embedding**:
    *   The backend sends the user's chat query to the TxAgent container's `/embed` endpoint (the same endpoint used for document embedding).
    *   The `Authorization` header (user's JWT) is passed to the TxAgent container.
    *   The TxAgent returns a 768-dimensional embedding of the query.
*   **Document Search (Retrieval)**:
    *   The `DocumentSearchService` is called with the query embedding and the `user_id`.
    *   This service executes a Supabase RPC function `public.match_documents`.
    *   **RLS/JWT for Search**: The `match_documents` function is defined with `SECURITY DEFINER` and `SET search_path = public, pg_catalog`. This means it runs with the permissions of the function's definer (typically the `service_role` user in Supabase) but *respects the RLS policies of the tables it queries based on the authenticated user's context*.
    *   **Current RLS on `documents` for `SELECT`**: The `public.documents` table currently has a `SELECT` RLS policy: `All authenticated users can read all documents` (`USING (true)`). This means that when `match_documents` is called by an authenticated user, it will search and return relevant documents from *all* users in the database, not just the current user's documents.
*   **Response Generation (Augmentation)**:
    *   The retrieved document chunks (context) and the original user query are sent to the TxAgent container's `/chat` endpoint.
    *   The `Authorization` header (user's JWT) is passed to the TxAgent container.
    *   The TxAgent uses its internal LLM (e.g., BioBERT-powered RAG) to generate a coherent response based on the provided context.
*   **Response to Frontend**: The TxAgent's response, along with any source citations, is returned to the frontend.

### 2.3. TxAgent Container Interaction

The TxAgent container, when acting as a chat agent, receives requests from the backend.

*   **Endpoint 1 (Embedding)**: `POST /embed` (for the user's query)
    *   **Request**: `{"text": "What are the symptoms of myocardial infarction?", "normalize": true}`
    *   **Headers**: `Authorization: Bearer <user_jwt_token>`, `X-API-Key: <runpod_key>`
    *   **Response**: `{"embedding": [0.1234, -0.5678, ...], "dimensions": 768, ...}`
*   **Endpoint 2 (Chat)**: `POST /chat`
    *   **Request**: `{"query": "...", "history": [], "top_k": 5, "temperature": 0.7, "stream": false}` (The `query` field is critical here, as per `MGCXT.md`). The `sources` (document content) are passed by the backend within the context of the `query`.
    *   **Headers**: `Authorization: Bearer <user_jwt_token>`, `X-API-Key: <runpod_key>`
    *   **Response**: `{"response": "...", "sources": [...], "processing_time": ..., "model": "BioBERT", ...}`
*   **RLS/JWT Handling**: The JWT is passed to the container primarily for authenticating the request. The container itself does not directly perform RLS on Supabase documents for chat, as the backend handles the document retrieval.

### 2.4. Supabase (`public.documents` table and `match_documents` function)

Supabase stores the documents and performs the vector similarity search.

*   **`match_documents` function**: This PostgreSQL function performs the vector similarity search.
    *   It queries the `public.documents` table.
    *   Because it's `SECURITY INVOKER` and the `documents` table has a `SELECT` RLS policy of `USING (true)`, it will search across *all* documents in the database, regardless of `user_id`.

## 3. Current State vs. Desired State for RLS and Functionality

### Current State

*   **Document Upload (RLS)**: **Correctly implemented.** Users can only upload, update, and delete their own documents. The `user_id` is correctly set during insertion.
*   **Chat Document Search (RLS)**: **Potential mismatch with user expectation.** The current RLS policy on `public.documents` for `SELECT` (`USING (true)`) allows *all authenticated users to read all documents*. This means the `match_documents` function will return relevant documents from a shared knowledge base, not just the current user's own documents. The comment in `backend/lib/services/DocumentSearchService.js` stating "RLS will handle user filtering automatically" is accurate in that RLS is applied, but the policy itself allows broad access for SELECT.
*   **TxAgent Container API Compliance**:
    *   The backend is configured to call the TxAgent container's `/embed` and `/chat` endpoints with the specified payloads and headers (including JWT).
    *   The backend expects 768-dimensional embeddings from TxAgent.
    *   **Issue**: Based on the provided logs (`Request failed with status code 404`), the TxAgent container's `/health` and `/chat` endpoints are not responding as expected, or the paths are incorrect on the container side. The `/embed` endpoint seems to be working, but the backend is falling back to OpenAI, suggesting the TxAgent's `/embed` might not be returning 768D or is otherwise failing silently before the dimension check.

### Where it Needs to Be to Function Properly

To ensure proper functionality and address potential RLS concerns for chat document search:

1.  **Clarify RLS for Document Search**:
    *   **If users should ONLY chat with their OWN documents**:
        *   **Action Required**: Modify the RLS policy on `public.documents` for `SELECT` from `USING (true)` to `USING (auth.uid() = user_id)`. This will automatically restrict the `match_documents` function to only return documents owned by the authenticated user.
    *   **If users should chat with a SHARED knowledge base (all documents)**:
        *   **No Change Required**: The current RLS policy `USING (true)` is correct for this scenario. The system is functioning as designed for a shared knowledge base.
        *   **Recommendation**: Ensure this design choice is clearly communicated to users.

2.  **TxAgent Container API Implementation**:
    *   **Critical**: The TxAgent container must fully implement the API specification outlined in `MGCXT.md`.
    *   **`/health` Endpoint**: Must return a 200 OK with the specified JSON schema. The 404 error in logs indicates this endpoint is not found or not correctly implemented.
    *   **`/embed` Endpoint**: Must consistently return 768-dimensional embeddings. If it's returning 1536D, the backend's dimension validation will cause a fallback or error.
    *   **`/chat` Endpoint**: Must accept the `query`, `history`, `top_k`, `temperature`, and `stream` fields as specified in `MGCXT.md`. The 404 error in logs suggests this endpoint is also not found or incorrectly implemented.
    *   **JWT Handling**: The container should be robust in handling the `Authorization` header, even if it doesn't perform its own RLS on Supabase.

By addressing these points, especially the TxAgent container's API compliance and the RLS policy for document selection during chat, the system will function as intended.
