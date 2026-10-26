import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { IS_SHARE } from './config'
import App from './App'
import { AppProvider } from './context/AppContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {IS_SHARE ? (
      // The shared page can't use real URLs, so navigation happens in memory and opens on the dashboard.
      <MemoryRouter initialEntries={['/admin']}>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>
    ) : (
      <BrowserRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>,
)
