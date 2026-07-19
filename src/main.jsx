import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import './index.css'
import { inject } from '@vercel/analytics'

inject()

class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, fontFamily: 'var(--font-ui)', textAlign: 'center', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--t1)' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Something went wrong</h2>
        <p style={{ color: 'var(--t3)', marginBottom: 24, maxWidth: 400 }}>{this.state.error.message}</p>
        <button onClick={() => window.location.reload()} style={{ background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>Reload</button>
      </div>
    )
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
