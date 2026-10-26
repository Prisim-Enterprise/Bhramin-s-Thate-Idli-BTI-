import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `--mode share` builds a single self-contained page for sharing (see scripts/make-share.mjs).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  ...(mode === 'share' && {
    base: './',
    build: {
      outDir: 'dist-share',
      assetsInlineLimit: 100_000_000, // embed the logo in the page
      cssCodeSplit: false,
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  }),
}))
