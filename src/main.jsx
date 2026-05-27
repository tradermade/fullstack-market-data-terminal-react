import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { bootApplySettings } from './components/SettingsModal.jsx'

try {
  const savedColorMode = localStorage.getItem('colorMode')
  document.documentElement.classList.toggle('dark', savedColorMode !== 'light')
} catch {
  document.documentElement.classList.add('dark')
}

// Apply persisted user theme/candle settings BEFORE React mounts so there's
// no flash of default colors when the user has customised the chart.
bootApplySettings();

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
)
