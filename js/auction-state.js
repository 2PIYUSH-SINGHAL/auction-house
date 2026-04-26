/* ════════════════════════════════════════════════════════════════
   AuctionState — global shared across login page and admin panel.
   status values: 'waiting' | 'live' | 'paused' | 'closed'
   ════════════════════════════════════════════════════════════════ */
window.AuctionState = (() => {
  const LS_KEY = 'ah_auction';

  const defaults = {
    status:     'waiting',
    sessionNum: 1,
    date:       '31 Jul 2026',
    startTime:  '21:00 IST',
    currentLot: null,
  };

  // Merge saved data over defaults so new fields are always present
  function fromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? Object.assign({}, defaults, JSON.parse(raw)) : { ...defaults };
    } catch { return { ...defaults }; }
  }

  let _state = fromStorage();

  const api = {
    // ── Getters ──────────────────────────────────────────────
    get status()     { return _state.status; },
    get sessionNum() { return _state.sessionNum; },
    get date()       { return _state.date; },
    get startTime()  { return _state.startTime; },
    get currentLot() { return _state.currentLot; },

    // ── Setters ───────────────────────────────────────────────
    set status(v)     { _state.status = v; },
    set sessionNum(v) { _state.sessionNum = v; },
    set currentLot(v) { _state.currentLot = v; },

    // ── Raw snapshot (for writes) ─────────────────────────────
    snapshot() { return { ..._state }; },

    // ── Save to localStorage ──────────────────────────────────
    save() {
      localStorage.setItem(LS_KEY, JSON.stringify(_state));
    },

    // ── Save to localStorage + push commit to GitHub ──────────
    async persist(sha, msg) {
      api.save();
      if (typeof GithubStore === 'undefined' || !GithubStore.hasToken()) return null;
      try {
        const newSha = await GithubStore.write(
          'data/auction.json',
          _state,
          sha || null,
          msg || `[auction] status → ${_state.status}`,
        );
        return newSha;
      } catch (e) {
        console.warn('AuctionState.persist failed:', e.message);
        return null;
      }
    },

    // ── Sync from GitHub (call on page load when online) ──────
    async sync() {
      try {
        const { data, sha } = await GithubStore.read('data/auction.json');
        _state = Object.assign({}, defaults, data);
        api.save();
        return sha;
      } catch (e) {
        console.warn('AuctionState.sync failed:', e.message);
        return null;
      }
    },

    // ── Convenience: is the auction currently accepting bids? ─
    isLive()   { return _state.status === 'live'; },
    isPaused() { return _state.status === 'paused'; },
    isClosed() { return _state.status === 'closed'; },
    isWaiting(){ return _state.status === 'waiting'; },
  };

  return api;
})();
