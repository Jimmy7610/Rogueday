import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { GameProvider } from './app/GameProvider';

import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/game.css';
import './styles/animations.css';

const container = document.getElementById('root');
if (!container) throw new Error('RogueDay: #root saknas i dokumentet.');

createRoot(container).render(
  <StrictMode>
    <GameProvider>
      <App />
    </GameProvider>
  </StrictMode>,
);

// Register the service worker for offline play. Failure is non-fatal: the game
// works fine without it, just without offline caching.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* Offline caching unavailable - gameplay is unaffected. */
    });
  });
}
