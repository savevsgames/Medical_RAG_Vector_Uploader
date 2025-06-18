import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // ✅ Development server config
  server: {
    port: 3000,
    host: true, // Allow external connections
    // ✅ Proxy API calls to backend during development
    proxy: {
      "/api": {
        target: "http://localhost:5000", // Your backend dev server
        changeOrigin: true,
        secure: false,
      },
      "/health": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      "/upload": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // ✅ Build configuration
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false, // Set to true for debugging
    // ✅ Optimize build
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          router: ["react-router-dom"],
        },
      },
    },
  },

  // ✅ Preview configuration (for production testing)
  preview: {
    port: 3000,
    host: true,
  },

  // ✅ Environment variables
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
});
