// Screen 3 — Create Lobby (§3.3). Ported markup/CSS from `MIMIC Prototype.html`; all visible text routed through t().

import { type FC, useState } from 'react';

import type { TranslateFn } from './sharedTypes';

export interface CreatePayload {
  lobbyName: string;
  roundDurationMinutes: number; // 1..10 (server defaults to 5 when out of range)
  changeMimicTarget: boolean; // true = ON, false = OFF
}

export interface CreateProps {
  t: TranslateFn;
  onBack: () => void;
  onCreate: (payload: CreatePayload) => void;
}

const DEFAULT_DURATION = 5;
/** Internal toggle state ('on' | 'off'); mapped to the boolean `changeMimicTarget` when submitting. */
type TargetToggle = 'on' | 'off';

/** Round-duration buttons (§3.3): discrete 1–10, defaulting to 5. */
const DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Create Lobby screen: lobby-name input, a "Game settings" card (duration grid + Change Mimic target toggle with the
 * helper lines), a `Default` reset button, and the full-width `Create` submit. All state is local; nothing hits the
 * server until the user presses `Create`.
 */
export const CreateScreen: FC<CreateProps> = ({ t, onBack, onCreate }) => {
  const [lobbyName, setLobbyName] = useState('');
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [target, setTarget] = useState<TargetToggle>('off');

  /** Reset duration to 5 and target to OFF without creating a room (§3.3). */
  const handleDefault = () => {
    setDuration(DEFAULT_DURATION);
    setTarget('off');
  };

  const handleSubmit = () => {
    onCreate({ lobbyName, roundDurationMinutes: duration, changeMimicTarget: target === 'on' });
  };

  return (
    <section id="screen-create" className="screen sub-screen is-active">
      <button type="button" className="back-btn" onClick={onBack}>
        {t('create.back')}
      </button>
      <h2 className="sub-title">{t('create.title')}</h2>

      <input
        type="text"
        className="dark-input create-name-input"
        placeholder={t('create.namePlaceholder')}
        value={lobbyName}
        onChange={(e) => setLobbyName(e.target.value)}
        autoComplete="off"
        aria-label={t('create.namePlaceholder')}
      />

      <div className="panel-card">
        <div className="card-header">
          <h3 className="card-title">{t('create.settingsHeader')}</h3>
          <button type="button" className="default-pill-btn" onClick={handleDefault}>
            {t('create.default')}
          </button>
        </div>
        <div className="settings-card-body">
          <div>
            <div className="setting-block-title">{t('create.durationLabel')}</div>
            <div className="duration-grid" role="radiogroup" aria-label={t('create.durationLabel')}>
              {DURATIONS.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`duration-btn${duration === value ? ' is-selected' : ''}`}
                  onClick={() => setDuration(value)}
                  aria-pressed={duration === value}
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="setting-block-title">{t('create.targetLabel')}</div>
            <div className="toggle-row" role="radiogroup" aria-label={t('create.targetLabel')}>
              <button
                type="button"
                className={`toggle-pill-btn${target === 'on' ? ' is-selected' : ''}`}
                onClick={() => setTarget('on')}
                aria-pressed={target === 'on'}
              >
                ON
              </button>
              <button
                type="button"
                className={`toggle-pill-btn${target === 'off' ? ' is-selected' : ''}`}
                onClick={() => setTarget('off')}
                aria-pressed={target === 'off'}
              >
                OFF
              </button>
            </div>

            <div className="toggle-help-list">
              <div className="toggle-help-row">
                <span className="toggle-help-tag">ON</span>
                <span>{t('create.toggleTargetOnHelp')}</span>
              </div>
              <div className="toggle-help-row">
                <span className="toggle-help-tag">OFF</span>
                <span>{t('create.toggleTargetOffHelp')}</span>
              </div>
            </div>
          </div>

          <p className="card-bottom-note">{t('create.footerNote')}</p>
        </div>
      </div>

      <button type="button" className="rect-action-btn create-submit-btn" onClick={handleSubmit}>
        {t('create.submitButton')}
      </button>
    </section>
  );
};
