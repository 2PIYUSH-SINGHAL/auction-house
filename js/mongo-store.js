/* ════════════════════════════════════════════════════════════════
   MongoStore — MongoDB Atlas Data API wrapper
   Fill in config.json at the repo root before deploying.
   ════════════════════════════════════════════════════════════════ */
window.MongoStore = (() => {
  let _cfg = null;

  function configPath() {
    return window.location.pathname.includes('/html/') ? '../config.json' : 'config.json';
  }

  async function loadConfig() {
    if (_cfg) return _cfg;
    const res = await fetch(configPath() + '?v=' + Date.now());
    if (!res.ok) throw new Error('config.json not found — fill it in at the repo root');
    _cfg = await res.json();
    if (!_cfg.mongoApiUrl || _cfg.mongoApiUrl.includes('YOUR_APP_ID')) {
      throw new Error('config.json not configured — set mongoApiUrl and mongoApiKey');
    }
    return _cfg;
  }

  async function call(action, body) {
    const cfg = await loadConfig();
    const res = await fetch(`${cfg.mongoApiUrl}/action/${action}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key':      cfg.mongoApiKey,
      },
      body: JSON.stringify({
        dataSource: cfg.dataSource || 'Cluster0',
        database:   cfg.database  || 'auction_hall',
        ...body,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `MongoDB ${action} failed (HTTP ${res.status})`);
    }
    return res.json();
  }

  // Strip MongoDB _id so callers always get plain objects
  function clean(doc) {
    if (!doc) return null;
    // eslint-disable-next-line no-unused-vars
    const { _id, ...rest } = doc;
    return rest;
  }

  return {
    async find(collection, filter = {}) {
      const r = await call('find', { collection, filter });
      return (r.documents || []).map(clean);
    },

    async findOne(collection, filter) {
      const r = await call('findOne', { collection, filter });
      return clean(r.document);
    },

    async insertOne(collection, doc) {
      return call('insertOne', { collection, document: doc });
    },

    async insertMany(collection, docs) {
      if (!docs || !docs.length) return;
      return call('insertMany', { collection, documents: docs });
    },

    async updateOne(collection, filter, update, upsert = false) {
      return call('updateOne', { collection, filter, update, upsert });
    },

    async deleteOne(collection, filter) {
      return call('deleteOne', { collection, filter });
    },

    async deleteMany(collection, filter = {}) {
      return call('deleteMany', { collection, filter });
    },

    // Replace every document in a collection — admin-only bulk operation
    async replaceAll(collection, docs) {
      await call('deleteMany', { collection, filter: {} });
      if (docs && docs.length) await call('insertMany', { collection, documents: docs });
    },

    // Test connectivity — resolves true or throws
    async ping() {
      await this.findOne('auction', { id: 'session' });
      return true;
    },
  };
})();
