// Bundles tests/aggregator.test.ts with esbuild (already installed with Vite) and runs it with Node's test runner.
// No extra test libraries. Usage: npm run test:recon
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Outside node_modules: Node's test runner skips files there.
const out = join(tmpdir(), 'bti-recon-test.mjs')
await build({
  entryPoints: ['tests/aggregator.test.ts'],
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
  // Run as in the offline dashboard: no cloud, nothing leaves this computer.
  define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_API_URL: '', VITE_SHARE: '', VITE_DEMO: '' }) },
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  // The Supabase client is for sign-in in the browser; tests run without it.
  plugins: [{ name: 'offline', setup(b) { b.onResolve({ filter: /[/]supabase$/ }, () => ({ path: resolve('tests/stubs/supabase.ts') })) } }],
})
const r = spawnSync(process.execPath, ['--test', out], { stdio: 'inherit' })
process.exit(r.status ?? 1)
