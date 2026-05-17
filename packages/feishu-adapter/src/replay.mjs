export function createFeishuReplayGuard({ ttlMs = 10 * 60 * 1000, requireEventId = true } = {}) {
  const seen = new Map();
  return {
    reserve(eventId) {
      cleanup();
      if (!eventId) {
        return !requireEventId;
      }
      if (seen.has(eventId)) {
        return false;
      }
      seen.set(eventId, Date.now());
      return true;
    },
    release(eventId) {
      seen.delete(eventId);
    },
  };

  function cleanup() {
    const threshold = Date.now() - ttlMs;
    for (const [eventId, seenAt] of seen) {
      if (seenAt < threshold) {
        seen.delete(eventId);
      }
    }
  }
}
