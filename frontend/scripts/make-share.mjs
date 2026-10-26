// Turns the share build into one self-contained HTML page (CSS and JS inlined)
// that can be published as a claude.ai Artifact. Output: dist-share/bti-dashboard.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'dist-share/assets'
const files = readdirSync(dir)
const css = readFileSync(join(dir, files.find((f) => f.endsWith('.css'))), 'utf8')
const js = readFileSync(join(dir, files.find((f) => f.endsWith('.js'))), 'utf8').replace(/<\/script/gi, '<\\/script')

const html = `<title>BTI Centre Kitchen Dashboard</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`
writeFileSync('dist-share/bti-dashboard.html', html)
console.log('Wrote dist-share/bti-dashboard.html (' + Math.round(html.length / 1024) + ' KB)')
