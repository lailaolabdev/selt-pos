import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import locatorJsx from '@locator/babel-jsx'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          [locatorJsx, { env: 'development' }],
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
