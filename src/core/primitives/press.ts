import type { KeyboardEvent } from 'react';

/**
 * Make a non-button element clickable the accessible way: it gets
 * role="button", joins the tab order, and Enter or Space press it.
 *
 *   <Frame {...onPress(() => setOpen(!open))}>...</Frame>
 *
 * Prefer `tag: button` when the content allows it (text only, no blocks).
 */
export function onPress(handler: () => void) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: handler,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      handler();
    },
  } as const;
}
