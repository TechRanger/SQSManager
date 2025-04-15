import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: true, // Listen on all addresses, including LAN
    port: 5173, // Explicitly set the frontend port
    proxy: {
      // Proxy API requests (including SSE on /api) to the backend server
      '/api': {
        target: 'http://localhost:3000', // Your backend address
        changeOrigin: true, // Needed for virtual hosted sites
        // secure: false, // Uncomment if your backend uses self-signed certificate
      },
      // Example if you needed separate WebSocket proxy later
      // '/socket.io': {
      //   target: 'ws://localhost:3000',
      //   ws: true,
      // }
    }
  }
})
