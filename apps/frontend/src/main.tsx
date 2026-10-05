import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element in index.html; cannot mount the app.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
