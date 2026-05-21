import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Set base to your repo name for GitHub Pages deployment
  // e.g. base: '/kwong-form843/' if your repo is github.com/user/kwong-form843
  base: '/kwong-form843/',
  server: {
    proxy: {
      // Proxy API requests to Anthropic in development
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
      }
    }
  }
})
