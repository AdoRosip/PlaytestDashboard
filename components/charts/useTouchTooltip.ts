'use client';
import { useState, type PointerEvent } from 'react';

// Touch has no hover, so nothing ever fires the mouseleave that closes the
// tooltip recharts opened under the finger — it just sits over the chart until
// you tap elsewhere. Dropping it on pointer-up, for touch and pen only, keeps
// press-and-hold usable for reading a bar's numbers while a plain tap-to-filter
// leaves nothing behind. `undefined` hands control back to recharts, so a mouse
// behaves exactly as before.
export function useTouchTooltip() {
  const [suppressed, setSuppressed] = useState(false);
  // Returning the same value lets React bail out, so this is safe on every move.
  const allow = () => setSuppressed((s) => (s ? false : s));
  const dismissAfterTouch = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') setSuppressed(true);
  };
  return {
    /** Spread onto the element wrapping the chart. */
    wrapperProps: {
      onPointerDown: allow,
      onPointerMove: allow,
      onPointerUp: dismissAfterTouch,
      onPointerCancel: dismissAfterTouch,
    },
    /** Pass as the recharts `<Tooltip active>` prop. */
    tooltipActive: suppressed ? false : undefined,
  };
}
