import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { IS_SHARE } from './config'
import App from './App'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import './index.css'

// After a new version goes live, a page left open may ask for files that no longer exist.
// Reload once to get the new version (at most once a minute, so it can't loop).
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('prisim.reloadedForUpdate') ?? 0)
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem('prisim.reloadedForUpdate', String(Date.now()))
  } catch { /* storage blocked: still reload */ }
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {IS_SHARE ? (
      // The shared page can't use real URLs, so navigation happens in memory and opens on the dashboard.
      <MemoryRouter initialEntries={['/admin']}>
        <AppProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AppProvider>
      </MemoryRouter>
    ) : (
      <BrowserRouter>
        <AppProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AppProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>,
)
