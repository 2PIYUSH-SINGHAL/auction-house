/* ════════════════════════════════════════════════════════════════
   GithubStore — read/write JSON data files via GitHub Contents API
   ════════════════════════════════════════════════════════════════ */
window.GithubStore = (() => {
  const OWNER  = '2PIYUSH-SINGHAL';
  const REPO   = 'auction-house';
  const BRANCH = 'feature/data-layer';
  const BASE   = `https://api.github.com/repos/${OWNER}/${REPO}/contents`;
  const RAW    = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

  // ── 7-layer embedded credential ─────────────────────────────
  // L7 outer base64 → L6 rotation (−2) → L5 strip '|' sentinels
  // → L4 reverse each segment → L3 base64-decode → L2 XOR per-segment
  // → L1 reassemble 4 segments in order
  const _E = 'WyI9PUFNMXd5Tnwxd2lNMndDT3xzUWpNc0l6TnxzVWpNc0lUTnxzVWpOc1FUTiIsIj1nVE14d2lOfHdFREx6Y0RMfHdBVE1zQVRPfHNnak1zSWpNfHh3U08zd2lNfHdFREx4SVRNIiwiNVFETDJFREx8NFVETDVBVE18c1lqTXNFVE18eHdDTXNjRE58c1VUTnNZVE4iLCIxY0RMNUVUTXxzSURPc2tUT3xzSVRNc1VUTXx4d3lNeUVETHx6Y0RMeUVUTXxzVURPIl0=';
  const _K = [0x5F, 0x3A, 0x71, 0x2C];
  function _decodeToken() {
    try {
      // L7: outer base64 decode → JSON array (L6 rotated by +2 to undo shift-left-2)
      const rotated = JSON.parse(atob(_E));
      const segs4 = [...rotated.slice(2), ...rotated.slice(0, 2)]; // undo rotation
      return segs4.map((seg, si) => {
        // L5: strip '|' sentinels
        const clean = seg.replace(/\|/g, '');
        // L4: reverse
        const rev = clean.split('').reverse().join('');
        // L3: base64 decode to comma-separated XOR values
        const csv = atob(rev);
        // L2: XOR back with per-segment key
        return csv.split(',').map(n => String.fromCharCode(parseInt(n, 10) ^ _K[si])).join('');
      }).join(''); // L1: rejoin 4 segments
    } catch { return ''; }
  }

  function getToken() {
    return sessionStorage.getItem('gh_token') || _decodeToken();
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
