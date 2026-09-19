import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './context/AppContext'
import { BackgroundTaskProvider } from './context/BackgroundTaskContext'
import App from './App'
import 'katex/dist/katex.min.css'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <BackgroundTaskProvider>
        <App />
      </BackgroundTaskProvider>
    </AppProvider>
  </StrictMode>
)
