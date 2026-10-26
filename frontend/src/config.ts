// True only in the shareable demo build (npm run build:share).
// That build runs inside a claude.ai page, where printing and file downloads are blocked.
export const IS_SHARE = import.meta.env.VITE_SHARE === '1'

// Shows a "Demo · sample data" label. On for the shared page and the Vercel build (VITE_DEMO=1).
export const IS_DEMO = IS_SHARE || import.meta.env.VITE_DEMO === '1'
