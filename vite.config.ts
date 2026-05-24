import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // relative base so the build works under a GitHub Pages project subpath
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
})
