import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/MDE-Formula-Finder/',
  server: {
    port: 3000,
    strictPort: false,
    open: true
  }
})