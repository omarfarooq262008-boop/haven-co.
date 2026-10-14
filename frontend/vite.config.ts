/// <reference types="vitest/config" />
import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'

/** Vercel injects these at build time — bake into the client bundle. */
const releaseSha =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VITE_VERCEL_GIT_COMMIT_SHA ||
  process.env.VITE_APP_RELEASE ||
  ''

const vercelEnv = process.env.VERCEL_ENV || process.env.VITE_VERCEL_ENV || ''

const sentryAuth = process.env.SENTRY_AUTH_TOKEN?.trim()
const sentryOrg = process.env.SENTRY_ORG?.trim()
const sentryProject = process.env.SENTRY_PROJECT?.trim()
const sentryUploadEnabled = Boolean(sentryAuth && sentryOrg && sentryProject)

const plugins: PluginOption[] = [react(), tailwindcss()]

if (sentryUploadEnabled) {
  plugins.push(
    sentryVitePlugin({
      org: sentryOrg!,
      project: sentryProject!,
      authToken: sentryAuth!,
      telemetry: false,
      release: {
        name: releaseSha ? `haven-co@${releaseSha}` : undefined,
      },
      sourcemaps: {
        // Do not leave .map files in the deployable dist/ (not publicly exposed)
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    }),
  )
}

export default defineConfig({
  plugins,
  define: {
    'import.meta.env.VITE_APP_RELEASE': JSON.stringify(releaseSha),
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(vercelEnv),
  },
  server: { port: 5173, strictPort: true },
  build: {
    // Hidden maps: generated for upload only, no sourceMappingURL in public JS.
    // When Sentry creds are missing, skip maps entirely.
    sourcemap: sentryUploadEnabled ? 'hidden' : false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@sentry')) return 'sentry'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('framer-motion')) return 'motion'
          if (id.includes('lucide-react')) return 'icons'
          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('/scheduler/') ||
            /[/\\]react[/\\]/.test(id)
          ) {
            return 'react-vendor'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
})
