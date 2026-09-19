import React from 'react'
import { createRoot } from 'react-dom/client'
import FloatingWindowPage from './pages/FloatingWindowPage'
import './index.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FloatingWindowPage />
  </React.StrictMode>
)
