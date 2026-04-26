/* ════════════════════════════════════════════════════════════════
   AuctionState — global shared across login page and admin panel.
   status values: 'waiting' | 'live' | 'paused' | 'closed'
   ════════════════════════════════════════════════════════════════ */

window.AUCTION_START_MS    = new Date('2026-07-31T21:00:00+05:30').getTime();
window.AUCTION_DURATION_MS = 60 * 60 * 1000;

window.AuctionState = (() => {
  const LS_KEY = 'ah_auction';

  const defaults = {
    id:         'session',
    status:     'waiting',
    sessionNum: 1,
    date:       '31 Jul 2026',
    startTime:  '21:00 IST',
    currentLot: null,
  };

  function fromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? Object.assign({}, defaults, JSON.parse(raw)) : { ...defaults };
    } catch { return { ...defaults }; }
  }

  let _state = fromStorage();

  const api = {
    get status()     { return _state.status; },
    get sessionNum() { return _state.sessionNum; },
    get date()       { return _state.date; },
    get startTime()  { return _state.startTime; },
    get currentLot() { return _state.currentLot; },

    set status(v)     { _state.status = v; },
    set sessionNum(v) { _state.sessionNum = v; },
    set currentLot(v) { _state.currentLot = v; },

    snapshot() { return { ..._state }; },

    save() { localStorage.setItem(LS_KEY, JSON.stringify(_state)); },

    async persist() {
      api.save();
      try {
        // updateOne = merge patch; upsert handled by RESTHeart PUT on first write
        await MongoStore.insertOne('auction', { ..._state, id: 'session' });
      } catch (e) {
        console.warn('AuctionState.persist failed:', e.message);
      }
    },

    async sync() {
      try {
        const doc = await MongoStore.findOne('auction', 'session');
        if (doc) {
          _state = Object.assign({}, defaults, doc);
          api.save();
        }
      } catch (e) {
        console.warn('AuctionState.sync failed:', e.message);
      }
    },

    isLive()   { return _state.status === 'live'; },
    isPaused() { return _state.status === 'paused'; },
    isClosed() { return _state.status === 'closed'; },
    isWaiting(){ return _state.status === 'waiting'; },
  };

  return api;
})();
