/**
 * A clock that ticks, for logic that is gated on the time of day.
 *
 * Contextual suggestions and the end-of-day reflection prompt both depend on
 * "what time is it now", not on any state the user changes. Without a tick they
 * would only be re-evaluated when something else happened to re-render the
 * screen — so a prompt scheduled for 6pm would stay hidden until the next tap.
 * A coarse interval (default 30s) is enough for both: neither is measured in
 * seconds, and the cost is one timer, cleaned up on unmount.
 *
 * The value is seeded from `Date.now()` at mount so the first render is already
 * correct rather than jumping after the first interval.
 */
import { useEffect, useState } from 'react';

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
