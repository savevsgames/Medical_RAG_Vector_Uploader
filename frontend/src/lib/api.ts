import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// ✅ Create centralized API client with axios
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ✅ Add request interceptor for auth tokens
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage (where Supabase stores it)
    const supabaseSession = localStorage.getItem(
      "sb-bfjfjxzdjhraabputkqi-auth-token"
    );

    if (supabaseSession) {
      try {
        const session = JSON.parse(supabaseSession);
        const token = session?.access_token;

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.warn("Failed to parse auth token from localStorage");
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ✅ Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      localStorage.removeItem("sb-bfjfjxzdjhraabputkqi-auth-token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ✅ Convenience methods for common operations
export const apiHelpers = {
  // Upload file with FormData
  uploadFile: async (file: File, endpoint: string = "/upload") => {
    const formData = new FormData();
    formData.append("file", file);

    return api.post(endpoint, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  // Poll job status
  pollJobStatus: async (jobId: string) => {
    return api.get(`/api/documents/job-status/${jobId}`);
  },

  // Agent operations
  agent: {
    getStatus: () => api.get("/api/agent/status"),
    start: () => api.post("/api/agent/start"),
    stop: () => api.post("/api/agent/stop"),
    healthCheck: () => api.post("/api/agent/test-health"),
  },

  // Chat operations
  chat: (message: string, options: any = {}) => {
    return api.post("/api/chat", {
      message,
      top_k: options.topK || 5,
      temperature: options.temperature || 0.7,
      ...options,
    });
  },

  // Embed operations
  embed: (text: string, options: any = {}) => {
    return api.post("/api/embed", {
      text,
      normalize: options.normalize || true,
      ...options,
    });
  },
};
