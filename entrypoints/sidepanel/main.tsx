import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme, readCachedPref } from './lib/theme';
import './style.css';

// Before the first paint, from the synchronous mirror; the stored preference
// is reconciled once React is up.
applyTheme(readCachedPref());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
