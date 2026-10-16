import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { Overlay } from './pages/Overlay'

async function boot() {
  if (!window.lolay) (await import('./mock')).installMock() // plain-browser dev preview
  const overlay = location.hash.startsWith('#overlay')
  if (overlay) for (const el of [document.documentElement, document.body]) el.style.background = 'transparent'
  createRoot(document.getElementById('root')!).render(overlay ? <Overlay /> : <App />)
}
boot()
