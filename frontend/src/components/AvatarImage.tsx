// Reusable circular avatar (§3.4/§5). Renders the assigned animal image, falling back to a themed color circle when the
// image fails or is unavailable (HANDOFF.md §5). Uses the shared AVATARS / AVATAR_COLORS registries so no missing-file
// references leak into components. Sizing comes from the caller's className (.player-avatar / .chat-bubble-avatar /
// .self-footer-avatar), keeping this file presentation-agnostic and reusable across every screen.

import { type FC, useState } from 'react';

import { AVATARS, AVATAR_COLORS, type AvatarId } from '../constants/avatars';

export interface AvatarImageProps {
  avatarId: AvatarId;
  className?: string; // sizing class (.player-avatar | .chat-bubble-avatar | .self-footer-avatar)
  alt?: string; // accessible label; defaults to the avatar id
  style?: React.CSSProperties; // optional inline styles (e.g. dimming opacity on eliminated players)
}

/** Circular avatar image with themed-color fallback on load failure (§5). */
export const AvatarImage: FC<AvatarImageProps> = ({ avatarId, className = '', alt, style }) => {
  const [failed, setFailed] = useState(false);
  // AVATAR_COLORS points at --avatar-* CSS vars already resolved on :root / theme selectors.
  const fallbackBg = `var(${AVATAR_COLORS[avatarId]})`;
  // Merge the themed background with any caller-supplied inline styles (e.g. dimming opacity).
  const mergedStyle: React.CSSProperties = { backgroundColor: fallbackBg, ...style };

  if (failed) {
    return <div className={className} style={mergedStyle} aria-hidden="true" />;
  }

  return (
    <img
      className={className}
      src={AVATARS[avatarId]}
      alt={alt ?? avatarId}
      onError={() => setFailed(true)}
      style={mergedStyle}
    />
  );
};
