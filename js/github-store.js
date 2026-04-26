/* ════════════════════════════════════════════════════════════════
   GithubStore — read/write JSON data files via GitHub Contents API
   Usage:
     GithubStore.init('ghp_yourtoken');
     const { data, sha } = await GithubStore.read('data/teams.json');
     await GithubStore.write('data/teams.json', newData, sha, 'msg');
   ════════════════════════════════════════════════════════════════ */
window.GithubStore = (() => {
  const OWNER  = '2PIYUSH-SINGHAL';
  const REPO   = 'auction-house';
  const BRANCH = 'feature/data-layer';
  const BASE   = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
  const RAW    = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

  function getToken() {
    return sessionStorage.getItem('gh_token') || '';
  }

  function headers(write = false) {
    const h = { 'Accept': 'application/vnd.github.v3+json' };
    const t = getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    if (write) h['Content-Type'] = 'application/json';
    return h;
  }

  // b64 encode that handles unicode
  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function b64decode(str) {
    return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
  }

  return {
    BRANCH,

    setToken(token) {
      sessionStorage.setItem('gh_token', token);
    },

    hasToken() {
      return !!getToken();
    },

    /* Read file via raw URL — no token needed for public repos.
       Used by login page to validate teams. */
    async readRaw(path) {
      const res = await fetch(`${RAW}/${path}?nocache=${Date.now()}`);
      if (!res.ok) throw new Error(`Cannot read ${path} (HTTP ${res.status})`);
      return res.json();
    },

    /* Read file via API — returns { data, sha }.
       sha is required for subsequent writes. */
    async read(path) {
      const res = await fetch(`${BASE}/${path}?ref=${BRANCH}`, { headers: headers() });
      if (!res.ok) throw new Error(`Cannot read ${path} (HTTP ${res.status})`);
      const json = await res.json();
      return {
        data: JSON.parse(b64decode(json.content)),
        sha:  json.sha,
      };
    },

    /* Write file — creates a commit on BRANCH.
       sha: current file sha (from read). Pass null to create a new file. */
    async write(path, data, sha, message) {
      if (!getToken()) throw new Error('GitHub token not configured. Open Settings.');
      const body = {
        message: message || `[auction] update ${path}`,
        content: b64encode(JSON.stringify(data, null, 2)),
        branch:  BRANCH,
      };
      if (sha) body.sha = sha;

      const res = await fetch(`${BASE}/${path}`, {
        method:  'PUT',
        headers: headers(true),
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Write failed (HTTP ${res.status})`);
      }
      const result = await res.json();
      return result.content.sha; // new sha after commit
    },
  };
})();
