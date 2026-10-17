import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'

async function boot() {
  if (!window.lolay) (await import('./mock')).installMock() // plain-browser dev preview
  createRoot(document.getElementById('root')!).render(<App />)
}
boot()
