import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: any;

const host = process.env.TAURI_DEV_HOST

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: host || false,
    port: 1420,
    strictPort: true,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api-elyby-textures': {
        target: 'https://skinsystem.ely.by',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-elyby-textures/, ''),
      },
      '/api-elyby-storage': {
        target: 'https://ely.by',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-elyby-storage/, ''),
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
