import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';

import { App } from './App';
// Initialize localization before the first render so initial strings resolve (§5).
import { i18n } from './locales';
i18n.init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
