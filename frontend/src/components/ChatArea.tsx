// Right-hand chat area (§3.4): message list with player bubbles (self vs other coloring), centered system notices, a
// 56px input bar, and *smart* auto-scroll. Auto-scroll follows new content only when the user is already near the
// bottom; if they have scrolled up to read history it stays put and shows an unobtrusive "scroll to bottom" affordance
// until they scroll back down (§3.4).

import { type FC, type FormEvent, useRef, useState, useEffect } from 'react';

import type { TranslateFn } from './sharedTypes';
import type { ChatMessage, SystemNotice } from '../types';
import { AvatarImage } from './AvatarImage';

/** One rendered line: either a player message or a centered system notice. */
export type ChatLine = { kind: 'message'; message: ChatMessage } | { kind: 'notice'; notice: SystemNotice };

export interface ChatAreaProps {
  t: TranslateFn;
  lines: ChatLine[];
  selfPlayerId?: string; // marks the viewer's own bubbles `.is-self`
  canSend: boolean; // spectators (eliminated) cannot send during a round (§4)
  onSend: (text: string) => void;
}

/** Maps a system notice type to its localized `chat.system.*` key. */
function noticeKey(t: TranslateFn, notice: SystemNotice): string {
  const suffix = notice.type === 'joined' ? 'joined' : notice.type === 'left' ? 'left' : notice.type === 'kicked' ? 'kicked' : 'banned';
  return t(`chat.system.${suffix}`, { alias: notice.alias ?? '' });
}

/** True when the scroll container is within `THRESHOLD`px of the bottom. */
function nearBottom(el: HTMLElement, threshold = 120): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

export const ChatArea: FC<ChatAreaProps> = ({ t, lines, selfPlayerId, canSend, onSend }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set true when the user scrolls up; suppresses forced auto-scroll and drives the affordance button.
  const [scrolledUp, setScrolledUp] = useState(false);
  const [draft, setDraft] = useState('');

  // Auto-scroll to the bottom whenever new content arrives — but only if the user is already near the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (!el || scrolledUp) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [lines.length, scrolledUp]);

  const handleScroll = () => {
    const el = listRef.current;
    if (el) setScrolledUp(!nearBottom(el));
  };

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setScrolledUp(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return; // reject empty/whitespace-only (§3.4); server also guards length
    onSend(text);
    setDraft('');
    inputRef.current?.focus();
  };

  return (
    <div className="lobby-chat-area">
      <div ref={listRef} className="chat-messages" onScroll={handleScroll}>
        {lines.map((line, index) =>
          line.kind === 'message' ? (
            <div key={index} className={`chat-bubble-row${line.message.senderPlayerId === selfPlayerId ? ' is-self-row' : ''}`}>
              <AvatarImage avatarId={line.message.senderAvatarId} className="chat-bubble-avatar" />
              <div className={`chat-bubble${line.message.text.includes('\n') ? ' is-multiline' : ''}${line.message.senderPlayerId === selfPlayerId ? ' is-self' : ''}`}>
                {line.message.text}
              </div>
            </div>
          ) : (
            <div key={`notice-${index}`} className="chat-system-notice">
              {noticeKey(t, line.notice)}
            </div>
          ),
        )}
      </div>

      {scrolledUp && lines.length > 0 ? (
        <button type="button" className="circle-icon-btn scroll-to-bottom-btn" aria-label={t('chat.scrollToBottom')} onClick={scrollToBottom}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      ) : null}

      <form className="chat-input-wrapper" onSubmit={handleSubmit}>
        <div className="chat-input-bar">
          <input
            ref={inputRef}
            type="text"
            className="chat-text-input"
            placeholder={t('chat.placeholder')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            disabled={!canSend}
          />
          <button type="submit" className="chat-send-btn" aria-label={t('chat.send')} disabled={!canSend || !draft.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
};
