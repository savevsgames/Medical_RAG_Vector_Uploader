# COMPANION_CONTEXT.md

This document describes how the Companion App should interact with the updated TxAgent system, aligning with the latest synchronous implementation and stable JWT-based authentication flow.

## Base URL

Use the following environment variable to define the container endpoint:

```ts
const TXAGENT_URL = "https://<your-txagent-container-url>";
```

---

## 🔐 Authentication

**Required for all routes except `/embed`.**

### Header format:

```http
Authorization: Bearer <supabase_jwt_token>
Content-Type: application/json
```

### Required JWT Claims:

```json
{
  "sub": "user-uuid",
  "aud": "authenticated",
  "role": "authenticated",
  "exp": 1234567890
}
```

---

## 📄 POST /process-document

**Purpose:** Schedule processing of a document that already exists in Supabase Storage.

### Request

```http
POST /process-document
```

#### Body:

```json
{
  "file_path": "documents/{user_id}/filename.pdf",
  "metadata": {
    "title": "Medical Guidelines",
    "author": "Dr. Smith",
    "category": "cardiology"
  }
}
```

#### Headers:

```
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Response:

```json
{
  "job_id": "uuid-string",
  "status": "pending",
  "message": "Document is being processed in the background"
}
```

---

## 📊 GET /embedding-jobs/{job_id}

**Purpose:** Check the status of a document processing job.

### Request

```http
GET /embedding-jobs/{job_id}
```

#### Headers:

```
Authorization: Bearer <jwt>
```

### Response:

```json
{
  "job_id": "uuid-string",
  "status": "completed",
  "chunk_count": 15,
  "document_ids": ["uuid-1", "uuid-2"],
  "error": null,
  "message": "Processing completed successfully"
}
```

---

## 💬 POST /chat

**Purpose:** Generate a contextual answer from the uploaded documents using BioBERT + OpenAI.

### Request

```http
POST /chat
```

#### Body:

```json
{
  "query": "What are the side effects of ibuprofen?",
  "top_k": 5,
  "temperature": 0.7,
  "stream": false
}
```

#### Headers:

```
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Response:

```json
{
  "response": "Ibuprofen may cause gastrointestinal issues...",
  "sources": [
    {
      "content": "Excerpt from source...",
      "metadata": {
        "title": "NSAID Guidelines",
        "page": 2
      },
      "similarity": 0.83,
      "filename": "pain-relief.pdf",
      "chunk_id": "chunk_7"
    }
  ],
  "processing_time": 921,
  "model": "BioBERT",
  "tokens_used": 102,
  "status": "success"
}
```

---

## 🧠 POST /embed

**Purpose:** Generate BioBERT embeddings from raw text. Used internally for similarity search.

### Request

```http
POST /embed
```

#### Body:

```json
{
  "text": "What is type 2 diabetes?",
  "normalize": true
}
```

#### Headers:

```
Content-Type: application/json
Authorization: Bearer <jwt> (optional)
```

### Response:

```json
{
  "embedding": [0.023, -0.012, 0.045, ...],
  "dimensions": 768,
  "model": "BioBERT",
  "processing_time": 174
}
```

---

## ✅ Recommendations for the Companion App

### 1. Token Handling

- Store and refresh Supabase JWT securely.
- Include token in all requests except `/embed` (optional).

### 2. Upload-to-Process Flow:

- Upload documents → Get `file_path`
- Call `/process-document` with `file_path`
- Poll `/embedding-jobs/{job_id}` until `status === completed`

### 3. Chat Integration:

- Submit user queries to `/chat`
- Display `response` and attributed `sources`

### 4. Embedding-Based Features:

- Use `/embed` to manually get BioBERT vectors for other advanced workflows like hybrid search.

---

## 🔒 Security Notes

- Ensure that every API call from the companion app uses `Authorization: Bearer <supabase_jwt>`
- Validate user session and handle `401 Unauthorized` errors gracefully
- Avoid storing token in localStorage unless absolutely necessary (prefer secure cookies or memory)
