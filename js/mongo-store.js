/* ════════════════════════════════════════════════════════════════
   MongoStore — RESTHeart REST API wrapper
   Basic auth, URL-based document identity.
   ════════════════════════════════════════════════════════════════ */
window.MongoStore = (() => {
  const BASE = 'https://eac7f4.eu-central-1-free-1.restheart.com';
  const DB   = 'auction_hall';
  const AUTH = 'Basic ' + btoa('root:Piyush@2010');

  function colUrl(name)     { return `${BASE}/${DB}/${name}`; }
  function docUrl(name, id) { return `${BASE}/${DB}/${name}/${encodeURIComponent(String(id))}`; }

  async function req(method, url, body) {
    const opts = {
      method,
      headers: { 'Authorization': AUTH, 'Accept': 'application/json' },
    };
    if (body !== undefined && body !== null) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 404)                           return null;
    if (res.status === 204 || res.status === 201)     return null;
    if (res.status === 200 && method === 'DELETE')    return null;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`RESTHeart ${method} (${res.status}): ${t.slice(0, 200)}`);
    }
    const text = await res.text();
    if (!text.trim()) return null;
    return JSON.parse(text);
  }

  // Strip _id — callers always get the plain document
  function clean(d) {
    if (!d) return null;
    const out = { ...d };
    delete out._id;
    return out;
  }

  // Ensure the database and all required collections exist (idempotent PUTs)
  async function ensureDB() {
    await req('PUT', `${BASE}/${DB}`, {});
    for (const col of ['auction', 'teams', 'lots', 'bids', 'passcode_requests']) {
      await req('PUT', colUrl(col), {});
    }
  }

  return {
    // ── Read ───────────────────────────────────────────────────

    async find(collection) {
      const results = [];
      let page = 1;
      while (true) {
        const data = await req('GET', `${colUrl(collection)}?pagesize=100&page=${page}`);
        if (!data) break;
        const arr = Array.isArray(data) ? data : (data._embedded || []);
        if (!arr.length) break;
        results.push(...arr.map(clean));
        if (arr.length < 100) break;
        page++;
      }
      return results;
    },

    // id: string — the document's id field (used as _id in RESTHeart)
    async findOne(collection, id) {
      const data = await req('GET', docUrl(collection, id));
      return clean(data);
    },

    // ── Write ──────────────────────────────────────────────────

    // Insert/replace document — uses doc.id as the URL key (PUT = upsert)
    async insertOne(collection, document) {
      const id = document.id;
      if (id != null) {
        await req('PUT', docUrl(collection, id), document);
      } else {
        await req('POST', colUrl(collection), document);
      }
    },

    async insertMany(collection, docs) {
      for (const d of docs) await this.insertOne(collection, d);
    },

    // Merge-patch update: fields = plain object of fields to set/update
    // RESTHeart PATCH = RFC 7396 merge patch — no $set needed
    async updateOne(collection, id, fields) {
      await req('PATCH', docUrl(collection, id), fields);
    },

    // ── Delete ─────────────────────────────────────────────────

    async deleteOne(collection, id) {
      await req('DELETE', docUrl(collection, id));
    },

    async deleteMany(collection) {
      // Try RESTHeart bulk delete (*), fall back to individual deletes
      try {
        const res = await fetch(`${colUrl(collection)}/*`, {
          method: 'DELETE',
          headers: { 'Authorization': AUTH },
        });
        if (res.ok || res.status === 204 || res.status === 200) return;
      } catch (_) {}
      // Fallback: read all, delete each
      const docs = await this.find(collection);
      for (const d of docs) {
        const id = d.id;
        if (id != null) await this.deleteOne(collection, id);
      }
    },

    // Replace entire collection — used for admin bulk sync & restart
    async replaceAll(collection, docs) {
      await this.deleteMany(collection);
      for (const d of docs) await this.insertOne(collection, d);
    },

    // ── Utility ────────────────────────────────────────────────

    async ping() {
      try {
        await ensureDB();
        return true;
      } catch (e) {
        throw new Error('Cannot reach RESTHeart: ' + e.message);
      }
    },
  };
})();
