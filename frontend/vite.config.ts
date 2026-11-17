import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev server is pinned to port 5175. strictPort: true means Vite will fail loudly if the port is busy,
// rather than silently switching to another port (per HANDOFF.md networking requirements).
// `/socket.io` (WebSocket included) is proxied to the backend on http://localhost:3000 so the client can talk
// to the server through the same origin during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
