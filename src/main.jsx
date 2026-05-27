import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

try {
  const savedColorMode = localStorage.getItem('colorMode')
  document.documentElement.classList.toggle('dark', savedColorMode !== 'light')
} catch {
  document.documentElement.classList.add('dark')
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
