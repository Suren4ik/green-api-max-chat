import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // относительные пути: сборка открывается и с корня домена, и с GitHub Pages (/<repo>/)
  base: './',
})
