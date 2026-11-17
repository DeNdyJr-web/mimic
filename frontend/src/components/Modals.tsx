// Modal contents for Mimic (§3.1): Settings (custom Theme + Language dropdowns), About, Credits, Versions.
// All visible text is routed through t(); the prototype's demo <script> logic is not used.

import { type FC } from 'react';

import type { Lang } from '../locales';
import type { ThemeMode } from '../theme';
import type { TranslateFn } from './sharedTypes';
import { Dropdown, ModalContainer, type ModalKey } from './Modal';

export interface ModalsProps {
  activeModal: ModalKey | null;
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  language: Lang;
  setLanguage: (lang: Lang) => void;
  t: TranslateFn;
  onClose: () => void;
}

const THEME_OPTIONS = ['system', 'dark', 'light'] as const;

/** Localized label for each supported language (§3.1). Explicit switch keeps t() keys type-safe. */
function languageLabel(lang: Lang, t: TranslateFn): string {
  switch (lang) {
    case 'en':
      return t('home.modals.settings.language.options.englishUs');
    case 'en-GB':
      return t('home.modals.settings.language.options.englishUk');
    case 'ru':
      return t('home.modals.settings.language.options.russian');
    case 'uk':
      return t('home.modals.settings.language.options.ukrainian');
    case 'es':
      return t('home.modals.settings.language.options.spanish');
    case 'de':
      return t('home.modals.settings.language.options.german');
    default:
      return t('home.modals.settings.language.options.englishUs');
  }
}

const SettingsModal: FC<{
  t: TranslateFn;
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  language: Lang;
  setLanguage: (lang: Lang) => void;
}> = ({ t, theme, setTheme, language, setLanguage }) => (
  <div className="settings-list">
    <div className="setting-row">
      <span className="setting-label">{t('home.modals.settings.theme.label')}</span>
      <Dropdown
        value={theme}
        onSelect={(value) => setTheme(value)}
        options={[
          { value: 'system', label: t('home.modals.settings.theme.system') },
          { value: 'dark', label: t('home.modals.settings.theme.dark') },
          { value: 'light', label: t('home.modals.settings.theme.light') },
        ]}
      />
    </div>

    <div className="setting-row">
      <span className="setting-label">{t('home.modals.settings.language.label')}</span>
      <Dropdown
        value={language}
        onSelect={(value) => setLanguage(value)}
        options={[
          { value: 'en', label: languageLabel('en', t) },
          { value: 'en-GB', label: languageLabel('en-GB', t) },
          { value: 'ru', label: languageLabel('ru', t) },
          { value: 'uk', label: languageLabel('uk', t) },
          { value: 'es', label: languageLabel('es', t) },
          { value: 'de', label: languageLabel('de', t) },
        ]}
      />
    </div>
  </div>
);

// About/Credits carry multi-line text (\n line breaks, \n\n paragraph break before "Rules:"). Render it in a single
// element with `white-space: pre-wrap` so the newlines survive instead of collapsing into one wrapped run.
const AboutModal: FC<{ t: TranslateFn }> = ({ t }) => (
  <p className="about-paragraph" style={{ whiteSpace: 'pre-wrap' }}>
    {t('home.modals.about.text')}
  </p>
);

const CreditsModal: FC<{ t: TranslateFn }> = ({ t }) => (
  <p className="about-paragraph" style={{ whiteSpace: 'pre-wrap' }}>
    {t('home.modals.credits.text')}
  </p>
);

const VersionsModal: FC<{ t: TranslateFn }> = ({ t }) => (
  <div>
    <p className="about-paragraph">{t('home.modals.versions.current.notes')}</p>
    <p className="about-paragraph">
      {t('home.modals.versions.current.version')} · {t('home.modals.versions.current.releaseDate')}
    </p>
  </div>
);

/** Renders the single active modal with its localized title; renders nothing when no modal is open. */
export const Modals: FC<ModalsProps> = ({
  activeModal,
  theme,
  setTheme,
  language,
  setLanguage,
  t,
  onClose,
}) => {
  if (!activeModal) return null;

  switch (activeModal) {
    case 'settings':
      return (
        <ModalContainer modalKey="settings" titleKey={t('home.modals.settings.title')} onClose={onClose}>
          <SettingsModal t={t} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} />
        </ModalContainer>
      );
    case 'about':
      return (
        <ModalContainer modalKey="about" titleKey={t('home.modals.about.title')} onClose={onClose}>
          <AboutModal t={t} />
        </ModalContainer>
      );
    case 'credits':
      return (
        <ModalContainer modalKey="credits" titleKey={t('home.modals.credits.title')} onClose={onClose}>
          <CreditsModal t={t} />
        </ModalContainer>
      );
    case 'versions':
      return (
        <ModalContainer modalKey="versions" titleKey={t('home.modals.versions.title')} onClose={onClose}>
          <VersionsModal t={t} />
        </ModalContainer>
      );
    default:
      return null;
  }
};

// Re-exported so callers can reference the modal key union without importing Modal directly.
export type { ModalKey };
