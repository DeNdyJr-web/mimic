// Screen 1 — Home (§3.1). Ported markup/CSS from `MIMIC Prototype.html`; all visible text routed through t().

import { type FC } from 'react';

import type { TranslateFn } from './sharedTypes';

export interface HomeProps {
  t: TranslateFn;
  onJoin: () => void;
  onCreate: () => void;
  onSettings: () => void;
  onAbout: () => void;
  onCredits: () => void;
  onVersions: () => void;
}

/** Home screen: large `MIMIC` title, three pill buttons, and the footer links (github is an external repo link). */
export const HomeScreen: FC<HomeProps> = ({
  t,
  onJoin,
  onCreate,
  onSettings,
  onAbout,
  onCredits,
  onVersions,
}) => (
  <main id="screen-home" className="screen home-screen is-active">
    <div className="home-center">
      <h1 className="home-title">{t('home.title')}</h1>
      <nav className="home-menu" aria-label="Main menu">
        <button type="button" className="pill-btn" onClick={onJoin}>
          {t('home.menu.joinLobby')}
        </button>
        <button type="button" className="pill-btn" onClick={onCreate}>
          {t('home.menu.createLobby')}
        </button>
        <button type="button" className="pill-btn" onClick={onSettings}>
          {t('home.menu.settings')}
        </button>
      </nav>
    </div>

    <footer className="home-footer">
      <div className="footer-group">
        <button type="button" className="footer-link" onClick={onAbout}>
          {t('home.footer.about')}
        </button>
        {/* §3.1 — github is an external link to the repo (not a modal). */}
        <a
          href="https://github.com/DeNdyJr-web/mimic/tree/main"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          {t('home.footer.github')}
        </a>
      </div>
      <div className="footer-group">
        <button type="button" className="footer-link" onClick={onCredits}>
          {t('home.footer.credits')}
        </button>
        <button type="button" className="footer-link" onClick={onVersions}>
          {t('home.footer.versions')}
        </button>
      </div>
    </footer>
  </main>
);
