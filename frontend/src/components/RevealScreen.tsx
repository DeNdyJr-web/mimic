// Screen 6 — End-of-Game Reveal (§3.6). Renders the match outcome driven STRICTLY by server `reveal` events — never by
// user click (§2 blacklist: do not advance the reveal on user click). The server emits stage 1 ("The mimic was...") and,
// after a fixed delay, stage 2 ("You won!" / "You lost!") to each client with their own win/loss; this component simply
// reflects `reveal.revealStage` and `reveal.isWinForClient`.

import { type FC } from 'react';

import type { TranslateFn } from './sharedTypes';
import type { TranslationKey } from '../locales';
import type { EndOfGameReveal } from '../types';
import { AvatarImage } from './AvatarImage';

export interface RevealScreenProps {
  t: TranslateFn;
  reveal: EndOfGameReveal;
}

/** Pick the heading key for the current reveal stage (§3.6). Stage 1 names the mimic; stage 2 shows the client's outcome. */
function headingFor(reveal: EndOfGameReveal): TranslationKey {
  if (reveal.revealStage === 2) return reveal.isWinForClient ? 'reveal.won' : 'reveal.lost';
  return 'reveal.mimicWas';
}

export const RevealScreen: FC<RevealScreenProps> = ({ t, reveal }) => {
  // `revealStage` defaults to 1 (§3.6), so an early/missing stage still shows "The mimic was..." rather than the outcome.
  // The heading is routed through t() so it renders the localized string (never a raw key like `reveal.lost`) (§5).
  const headingKey = headingFor(reveal);

  return (
    <section id="screen-reveal" className="screen reveal-screen is-active">
      <div className="reveal-center">
        <h2 className="reveal-heading">{t(headingKey)}</h2>
        <div className="reveal-card">
          <AvatarImage avatarId={reveal.mimicAvatarId} className="reveal-avatar" alt={reveal.mimicAlias} />
          <span className="reveal-name">{reveal.mimicAlias}</span>
        </div>
      </div>
    </section>
  );
};
