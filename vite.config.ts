import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    open: false,
    host: true // Binds to 0.0.0.0 so both localhost, 127.0.0.1 and IPv6 work
  }
});
