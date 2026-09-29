/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8901',
      '/ws': { target: 'ws://127.0.0.1:8901', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
