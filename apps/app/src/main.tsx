import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/caveat'
import '@fontsource-variable/inter'
import '@fontsource-variable/inter/wght-italic.css'
import '@fontsource-variable/lora'
import '@fontsource-variable/lora/wght-italic.css'
import '@fontsource-variable/roboto-slab'
import 'katex/dist/katex.min.css'
import './index.css'
import { App } from '@/app/App'
import '@/pwa/register-service-worker'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
