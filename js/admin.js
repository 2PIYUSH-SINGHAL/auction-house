// ════════════════════════════════════════════════════════════════
// ADMIN PANEL — hack.welham Auction Hall
// ════════════════════════════════════════════════════════════════

// ── Auctioneer identity ────────────────────────────────────────
const auctioneerName = sessionStorage.getItem('auctioneer_name') || 'Auctioneer';
document.getElementById('auctioneer-display').textContent = auctioneerName;

// ── Helpers ────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function nowTime() {
  const n = new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
}
function nowDate() { return new Date().toLocaleDateString('en-IN'); }

function ls(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ── State ──────────────────────────────────────────────────────
// sessionState is a convenience alias — AuctionState.status is authoritative
let sessionState = AuctionState.status;
let teams      = ls('ah_teams',        []);
let lots       = ls('ah_lots',         []);
let bids       = ls('ah_bids',         []);
let loginLogs  = ls('ah_loginlogs',    []);
let forgotReqs = ls('ah_forgot',       []);
let acLog      = ls('ah_auctioneer_log', []);

// SHAs for GitHub writes (populated on read)
const shas = {};

function saveAll() {
  lsSet('ah_teams', teams);
  lsSet('ah_lots',  lots);
  lsSet('ah_bids',  bids);
  // loginLogs, forgotReqs, acLog are excluded — they manage their own
  // localStorage reads/writes and must not be overwritten with a stale
  // in-memory snapshot taken at page-load time
}


// ════════════════════════════════════════════════════════════════
// GITHUB SYNC
// ════════════════════════════════════════════════════════════════
function setSyncStatus(msg, ok) {
  const el = document.getElementById('sync-status');
  el.textContent = msg;
  el.style.color = ok === true  ? '#a8622f'
                 : ok === false ? '#e07060'
                 : 'rgba(234,223,199,0.3)';
}

async function syncRead(path, localKey, fallback) {
  try {
    const { data, sha } = await GithubStore.read(path);
    shas[path] = sha;
    lsSet(localKey, data);
    return data;
  } catch (e) {
    console.warn(`GitHub read failed for ${path}:`, e.message);
    return ls(localKey, fallback);
  }
}

async function syncWrite(path, data, localKey, msg) {
  lsSet(localKey, data);
  if (!GithubStore.hasToken()) return;
  try {
    setSyncStatus('Syncing…');
    // writeRetry re-reads the current SHA each attempt — no stale SHA failures
    const { sha } = await GithubStore.writeRetry(path, () => data, msg);
    shas[path] = sha;
    setSyncStatus('Synced ' + nowTime(), true);
  } catch (e) {
    setSyncStatus('Sync failed: ' + e.message, false);
    toast('GitHub sync failed: ' + e.message);
  }
}

// Safe teams write: reads fresh GitHub data first, merges admin changes
// but preserves loginLocked/loggedIn from GitHub unless explicitly unlocking.
// unlockId: teamId to explicitly unlock, null for all other writes.
async function syncWriteTeamsSafe(msg, unlockId = null) {
  lsSet('ah_teams', teams);
  if (!GithubStore.hasToken()) return;
  try {
    setSyncStatus('Syncing…');
    const { data: result, sha } = await GithubStore.writeRetry(
      'data/teams.json',
      (fresh) => {
        const freshMap = {};
        (Array.isArray(fresh) ? fresh : []).forEach(t => { freshMap[t.id] = t; });
        return teams.map(lt => {
          const ft = freshMap[lt.id];
          if (!ft || lt.id === unlockId) return lt; // new team or explicit unlock
          // Preserve login state from GitHub — never accidentally clear a lock
          return {
            ...lt,
            loggedIn:    ft.loggedIn    || lt.loggedIn,
            loginLocked: ft.loginLocked || lt.loginLocked,
            loginTime:   ft.loginTime   || lt.loginTime,
          };
        });
      },
      msg
    );
    teams = result;
    lsSet('ah_teams', teams);
    shas['data/teams.json'] = sha;
    setSyncStatus('Synced ' + nowTime(), true);
  } catch (e) {
    setSyncStatus('Sync failed: ' + e.message, false);
    toast('GitHub sync failed: ' + e.message);
  }
}

// Load all data from GitHub on startup
async function initData() {
  setSyncStatus('Loading…');
  try {
    teams      = await syncRead('data/teams.json',             'ah_teams',        teams);
    lots       = await syncRead('data/lots.json',              'ah_lots',         lots);
    forgotReqs = await syncRead('data/passcode-requests.json', 'ah_forgot',       forgotReqs);
    acLog      = await syncRead('data/auctioneer-log.json',    'ah_auctioneer_log', acLog);
    // Sync auction status — updates AuctionState global and caches SHA for writes
    shas['data/auction.json'] = await AuctionState.sync();
    sessionState = AuctionState.status;
    setSession(sessionState);           // apply synced status to UI
    setSyncStatus('Loaded ' + nowTime(), true);
  } catch (e) {
    setSyncStatus('Offline — using local data', null);
  }
  renderStats();
  updateCountPills();
}

// GitHub settings modal
document.getElementById('btn-gh-settings').addEventListener('click', () => {
  document.getElementById('gh-token-input').value = '';
  document.getElementById('gh-token-status').textContent =
    GithubStore.hasToken() ? '✓ Token configured' : 'No token set';
  document.getElementById('modal-gh').classList.remove('hidden');
});

document.getElementById('btn-gh-save').addEventListener('click', async () => {
  const token = document.getElementById('gh-token-input').value.trim();
  if (!token) { document.getElementById('gh-token-status').textContent = 'Enter a token first.'; return; }
  GithubStore.setToken(token);
  document.getElementById('gh-token-status').textContent = 'Testing…';
  try {
    await GithubStore.read('data/teams.json');
    document.getElementById('gh-token-status').textContent = '✓ Connected';
    setTimeout(() => { document.getElementById('modal-gh').classList.add('hidden'); initData(); }, 800);
  } catch (e) {
    document.getElementById('gh-token-status').textContent = '✗ ' + e.message;
  }
});


// ════════════════════════════════════════════════════════════════
// CLOCK
// ════════════════════════════════════════════════════════════════
function updateClock() {
  document.getElementById('live-clock').textContent = nowTime() + ' IST';
}
updateClock();
setInterval(updateClock, 1000);


// ════════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════════
function navigateTo(name) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (navItem) navItem.classList.add('active');
  const section = document.getElementById('section-' + name);
  if (section) section.classList.add('active');
  refreshSection(name);
}

document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', () => {
    if (item.classList.contains('locked')) return;
    navigateTo(item.dataset.section);
  });
});

function refreshSection(name) {
  if (name === 'session')     { renderStats(); renderLiveFeed(); }
  if (name === 'lots')        renderLots();
  if (name === 'bids')        renderBids();
  if (name === 'login-logs')  renderLoginLogs();
  if (name === 'teams')       renderTeams();
  if (name === 'forgot')      renderForgot();
  if (name === 'ac-log')      renderAcLog();
  if (name === 'unsold')      renderUnsold();
  if (name === 'restart')     renderRestart();
  if (name === 'overspent')   renderOverspent();
  if (name === 'remove-lots') renderRemoveLots();
}


// ════════════════════════════════════════════════════════════════
// 1. SESSION
// ════════════════════════════════════════════════════════════════
const statusDot   = document.getElementById('status-dot');
const statusText  = document.getElementById('status-text');
const btnStart    = document.getElementById('btn-start');
const btnPause    = document.getElementById('btn-pause');
const btnEnd      = document.getElementById('btn-end');
const sessionPill = document.getElementById('nav-session-pill');

function setSession(state) {
  sessionState = state;
  // Keep global in sync and persist to localStorage + GitHub
  AuctionState.status = state;
  AuctionState.persist(shas['data/auction.json'])
    .then(newSha => { if (newSha) shas['data/auction.json'] = newSha; });

  statusDot.className  = 'status-dot';
  statusText.className = 'status-text';
  sessionPill.className = 'status-pill';
  sessionPill.textContent = '';

  if (state === 'live') {
    statusDot.classList.add('live');
    statusText.classList.add('live');
    statusText.textContent = 'Session live';
    btnStart.textContent = 'Running…';
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnEnd.disabled   = false;
    sessionPill.classList.add('live');
    sessionPill.textContent = 'live';
    addLoginLog('SYSTEM', 'system', 'Session opened by ' + auctioneerName, navigator.platform);
    unlockPostAuction(false);
  } else if (state === 'paused') {
    statusDot.classList.add('paused');
    statusText.classList.add('paused');
    statusText.textContent = 'Session paused';
    btnStart.textContent = 'Resume';
    btnStart.disabled = false;
    btnPause.disabled = true;
    addLoginLog('SYSTEM', 'system', 'Session paused', '');
  } else if (state === 'closed') {
    statusText.textContent = 'Session closed';
    btnStart.disabled = true;
    btnPause.disabled = true;
    btnEnd.disabled   = true;
    addLoginLog('SYSTEM', 'system', 'Session closed by ' + auctioneerName, '');
    unlockPostAuction(true);
    toast('Session closed — post-auction sections unlocked');
  } else {
    statusText.textContent = 'Waiting to open';
    btnStart.textContent = 'Open session';
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnEnd.disabled   = true;
  }
  renderStats();
}

function unlockPostAuction(unlock) {
  document.querySelectorAll('.post-auction').forEach(el => el.classList.toggle('locked', !unlock));
}

// ── Test mode ──────────────────────────────────────────────────
const testModeToggle = document.getElementById('test-mode-toggle');
let testMode = localStorage.getItem('ah_test_mode') === 'true';
testModeToggle.checked = testMode;

testModeToggle.addEventListener('change', () => {
  testMode = testModeToggle.checked;
  localStorage.setItem('ah_test_mode', String(testMode));
  updateStartLock();
});

// ── Admin countdown + auto-start/end ──────────────────────────
const adminCdEl  = document.getElementById('admin-countdown');
const adminCdSub = document.getElementById('admin-countdown-sub');
const timerNote  = document.getElementById('session-timer-note');
let autoEndTimer = null;

function updateStartLock() {
  const now = Date.now();
  const ready = now >= AUCTION_START_MS;
  if (testMode || ready || sessionState !== 'waiting') {
    timerNote.classList.add('hidden');
    if (sessionState === 'waiting') btnStart.disabled = false;
  } else {
    timerNote.textContent = '⌁ Auction not open yet — timer must reach zero or enable Test Mode ⌁';
    timerNote.classList.remove('hidden');
    btnStart.disabled = true;
  }
}

function updateAdminCountdown() {
  const diff = AUCTION_START_MS - Date.now();
  if (diff <= 0) {
    adminCdEl.textContent = '00:00:00';
    adminCdEl.classList.add('zeroed');
    adminCdSub.textContent = 'Doors are open';
    updateStartLock();
    // Auto-start exactly once when timer hits zero
    if (!testMode && AuctionState.isWaiting()) {
      autoStart();
    }
  } else {
    adminCdEl.classList.remove('zeroed');
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    adminCdEl.textContent =
      `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    updateStartLock();
  }
}

function autoStart() {
  if (!AuctionState.isWaiting()) return;
  setSession('live');
  toast('Auction opened automatically at 21:00 IST');
  scheduleAutoEnd();
}

function scheduleAutoEnd() {
  clearTimeout(autoEndTimer);
  if (testMode) return;
  const msUntilEnd = (AUCTION_START_MS + AUCTION_DURATION_MS) - Date.now();
  if (msUntilEnd <= 0) return;
  autoEndTimer = setTimeout(() => {
    if (AuctionState.isLive()) {
      setSession('closed');
      toast('Auction closed automatically after 1 hour');
    }
  }, msUntilEnd);
}

// Re-schedule auto-end if we load the admin panel while the session is already live
if (AuctionState.isLive()) scheduleAutoEnd();

updateAdminCountdown();
setInterval(updateAdminCountdown, 1000);

btnStart.addEventListener('click', () => {
  if (sessionState === 'waiting' || sessionState === 'paused') {
    setSession('live');
    if (!testMode) scheduleAutoEnd();
  }
});
btnPause.addEventListener('click', () => {
  if (sessionState === 'live') {
    clearTimeout(autoEndTimer);
    setSession('paused');
  }
});
btnEnd.addEventListener('click', () => {
  if (!confirm('Close the session? Post-auction sections will unlock.')) return;
  clearTimeout(autoEndTimer);
  setSession('closed');
});

function renderStats() {
  document.getElementById('stat-teams').textContent  = teams.length;
  document.getElementById('stat-lots').textContent   = lots.length;
  document.getElementById('stat-bids').textContent   = bids.length;
  const raised = bids.filter(b => b.status === 'won').reduce((s, b) => s + b.amount, 0);
  document.getElementById('stat-raised').textContent = '₹ ' + raised.toLocaleString();
}

setSession(AuctionState.status); // restore UI from last known state on load

// ── Live bid feed ──────────────────────────────────────────────
function renderLiveFeed() {
  const list = document.getElementById('live-feed');
  const recent = [...bids].reverse().slice(0, 12);
  if (!recent.length) {
    list.innerHTML = '<li class="feed-empty">No bids yet. Feed will update as bids are recorded.</li>';
    return;
  }
  list.innerHTML = recent.map((b, i) => `
    <li class="feed-item" style="animation-delay:${i * 0.04}s">
      <span class="feed-time">${b.time}</span>
      <span class="feed-team">${b.teamId}</span>
      <span class="feed-arrow">→</span>
      <span class="feed-lot">${b.lotTitle || '—'}</span>
      <span class="feed-amount">₹ ${Number(b.amount).toLocaleString()}</span>
      <span class="badge badge-${b.status}">${b.status}</span>
    </li>
  `).join('');
}

// Poll GitHub for bids + lots every 8s — source of truth for cross-device
setInterval(async () => {
  try {
    const [freshBids, freshLots, freshTeams] = await Promise.all([
      GithubStore.readRaw('data/bids.json'),
      GithubStore.readRaw('data/lots.json'),
      GithubStore.readRaw('data/teams.json'),
    ]);
    if (Array.isArray(freshBids))  { bids  = freshBids;  lsSet('ah_bids',  bids); }
    if (Array.isArray(freshLots))  { lots  = freshLots;  lsSet('ah_lots',  lots); }
    if (Array.isArray(freshTeams)) { teams = freshTeams; lsSet('ah_teams', teams); }
  } catch (_) { /* keep stale data on network error */ }
  if (document.getElementById('section-session').classList.contains('active')) {
    renderLiveFeed();
    renderStats();
  }
}, 8000);

// Instant update when another tab on the same browser writes to localStorage
window.addEventListener('storage', e => {
  if (e.key === 'ah_bids') {
    bids = JSON.parse(e.newValue || '[]');
    renderLiveFeed();
    renderStats();
  }
  if (e.key === 'ah_lots')  { lots  = JSON.parse(e.newValue || '[]'); }
  if (e.key === 'ah_teams') { teams = JSON.parse(e.newValue || '[]'); }
});


// ════════════════════════════════════════════════════════════════
// 2. LOTS
// ════════════════════════════════════════════════════════════════
function renderLots() {
  const tbody = document.getElementById('lots-tbody');
  if (!lots.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No lots added yet.</td></tr>';
    return;
  }
  tbody.innerHTML = lots.map(l => `
    <tr>
      <td class="cell-mono">${l.num}</td>
      <td>${l.title}</td>
      <td style="color:rgba(234,223,199,0.45);font-size:13px">${l.desc || '—'}</td>
      <td class="cell-amount">₹ ${Number(l.floor).toLocaleString()}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="editLot('${l.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLot('${l.id}')" style="margin-left:6px">Delete</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('btn-add-lot').addEventListener('click', () => openLotModal());

document.getElementById('btn-sync-lots').addEventListener('click', async () => {
  await syncWrite('data/lots.json', lots, 'ah_lots', '[auction] update lots');
});

function openLotModal(id) {
  const modal = document.getElementById('modal-lot');
  document.getElementById('lot-edit-id').value = id || '';
  document.getElementById('modal-lot-title').innerHTML = id ? 'Edit <em>lot</em>' : 'Add <em>lot</em>';
  if (id) {
    const l = lots.find(x => x.id === id);
    if (l) {
      document.getElementById('lot-num').value   = l.num;
      document.getElementById('lot-title').value = l.title;
      document.getElementById('lot-desc').value  = l.desc;
      document.getElementById('lot-floor').value = l.floor;
    }
  } else {
    document.getElementById('form-lot').reset();
  }
  modal.classList.remove('hidden');
}

function editLot(id) { openLotModal(id); }

function deleteLot(id) {
  if (!confirm('Delete this lot?')) return;
  lots = lots.filter(l => l.id !== id);
  saveAll();
  renderLots();
  toast('Lot deleted');
}

document.getElementById('form-lot').addEventListener('submit', e => {
  e.preventDefault();
  const editId = document.getElementById('lot-edit-id').value;
  const data = {
    id:     editId || 'lot-' + Date.now(),
    num:    document.getElementById('lot-num').value.trim()   || String(lots.length + 1).padStart(2, '0'),
    title:  document.getElementById('lot-title').value.trim(),
    desc:   document.getElementById('lot-desc').value.trim(),
    floor:  parseInt(document.getElementById('lot-floor').value, 10) || 0,
    status: editId ? (lots.find(l => l.id === editId)?.status || 'pending') : 'pending',
  };
  if (!data.title) return;
  lots = editId ? lots.map(l => l.id === editId ? data : l) : [...lots, data];
  saveAll();
  renderLots();
  document.getElementById('modal-lot').classList.add('hidden');
  toast(editId ? 'Lot updated' : 'Lot added');
});


// ════════════════════════════════════════════════════════════════
// 3. BIDS
// ════════════════════════════════════════════════════════════════
function renderBids() {
  const tbody = document.getElementById('bids-tbody');
  if (!bids.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No bids recorded yet.</td></tr>';
    return;
  }
  tbody.innerHTML = [...bids].reverse().map(b => `
    <tr>
      <td style="color:rgba(234,223,199,0.35);font-family:'Special Elite',monospace;font-size:11px;white-space:nowrap">${b.time}</td>
      <td class="cell-mono">${b.teamId}</td>
      <td>${b.lotTitle || '—'}</td>
      <td class="cell-amount">₹ ${Number(b.amount).toLocaleString()}</td>
      <td><span class="badge badge-${b.status}">${b.status}</span></td>
    </tr>
  `).join('');
}

document.getElementById('btn-add-bid').addEventListener('click', () => {
  populateBidSelects();
  document.getElementById('form-bid').reset();
  document.getElementById('modal-bid').classList.remove('hidden');
});

function populateBidSelects() {
  document.getElementById('bid-team').innerHTML =
    teams.map(t => `<option value="${t.id}">${t.id} — ${t.school}</option>`).join('');
  document.getElementById('bid-lot').innerHTML =
    lots.map(l  => `<option value="${l.id}">${l.num} · ${l.title}</option>`).join('');
}

document.getElementById('form-bid').addEventListener('submit', e => {
  e.preventDefault();
  const teamId = document.getElementById('bid-team').value;
  const lotId  = document.getElementById('bid-lot').value;
  const amount = parseInt(document.getElementById('bid-amount').value, 10) || 0;
  const status = document.getElementById('bid-status').value;
  const lot    = lots.find(l => l.id === lotId);
  const bid = {
    id: 'bid-' + Date.now(),
    teamId, lotId, lotTitle: lot?.title || '—', amount, status, time: nowTime(),
  };
  bids.push(bid);

  if (status === 'won' && lot) {
    lots = lots.map(l => l.id === lotId ? { ...l, status: 'sold', soldTo: teamId, soldFor: amount } : l);
    teams = teams.map(t => t.id === teamId ? { ...t, spent: (t.spent || 0) + amount } : t);
  }

  saveAll();
  renderBids();
  renderLiveFeed();
  renderStats();
  document.getElementById('modal-bid').classList.add('hidden');
  updateCountPills();
  toast('Bid recorded');
});


// ════════════════════════════════════════════════════════════════
// 4. LOGIN LOGS
// ════════════════════════════════════════════════════════════════
function addLoginLog(teamId, status, note, device) {
  loginLogs = ls('ah_loginlogs', loginLogs); // freshen from storage
  loginLogs.unshift({ time: nowTime(), teamId, status, note: note || '', device: device || '' });
  if (loginLogs.length > 300) loginLogs.pop();
  lsSet('ah_loginlogs', loginLogs);
}

function renderLoginLogs() {
  loginLogs = ls('ah_loginlogs', loginLogs);
  const tbody = document.getElementById('logs-tbody');
  if (!loginLogs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No login attempts recorded.</td></tr>';
    return;
  }
  tbody.innerHTML = loginLogs.map(l => `
    <tr>
      <td style="color:rgba(234,223,199,0.35);font-family:'Special Elite',monospace;font-size:11px;white-space:nowrap">${l.time}</td>
      <td class="cell-mono">${l.teamId}</td>
      <td><span class="badge badge-${l.status === 'success' ? 'active' : l.status === 'system' ? 'pending' : l.status === 'auctioneer' ? 'won' : 'outbid'}">${l.status}</span></td>
      <td style="font-size:13px;color:rgba(234,223,199,0.5)">${l.note || ''}</td>
      <td style="font-size:12px;color:rgba(234,223,199,0.3)">${l.device || ''}</td>
    </tr>
  `).join('');
}

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  if (!confirm('Clear all login logs?')) return;
  loginLogs = [];
  lsSet('ah_loginlogs', loginLogs);
  renderLoginLogs();
  toast('Logs cleared');
});


// ════════════════════════════════════════════════════════════════
// 5. TEAMS & PASSWORDS
// ════════════════════════════════════════════════════════════════
function renderTeams() {
  const tbody = document.getElementById('teams-tbody');
  if (!teams.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No teams registered.</td></tr>';
    return;
  }
  tbody.innerHTML = teams.map(t => {
    const locked = t.loginLocked;
    const badgeClass = locked ? 'badge-outbid' : t.loggedIn ? 'badge-active' : 'badge-pending';
    const badgeText  = locked ? 'locked'        : t.loggedIn ? 'logged in'   : 'waiting';
    return `
    <tr>
      <td class="cell-mono">${t.id}</td>
      <td>${t.school}</td>
      <td class="cell-amount">₹ ${Number(t.balance).toLocaleString()}</td>
      <td class="${(t.spent || 0) > (t.balance || 0) ? 'cell-over' : 'cell-amount'}">₹ ${Number(t.spent || 0).toLocaleString()}</td>
      <td><span class="badge ${badgeClass}">${badgeText}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn btn-ghost btn-sm" onclick="openEditTeam('${t.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTeam('${t.id}')" style="margin-left:6px">Remove</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('btn-add-team').addEventListener('click', () => {
  document.getElementById('form-team').reset();
  document.getElementById('modal-team').classList.remove('hidden');
});

document.getElementById('btn-sync-teams').addEventListener('click', async () => {
  await syncWriteTeamsSafe('[auction] update teams');
});

document.getElementById('form-team').addEventListener('submit', e => {
  e.preventDefault();
  const id      = document.getElementById('team-id').value.trim().toUpperCase();
  const school  = document.getElementById('team-school').value.trim();
  const pass    = document.getElementById('team-pass').value.trim();
  const balance = parseInt(document.getElementById('team-balance').value, 10) || 1000;
  if (!id || !school) return;
  if (teams.find(t => t.id === id)) { toast('Team ID already exists'); return; }
  teams.push({ id, school, passcode: pass, balance, spent: 0, loggedIn: false, loginLocked: false, loginTime: null });
  saveAll();
  renderTeams();
  updateCountPills();
  document.getElementById('modal-team').classList.add('hidden');
  toast('Team added');
});

function openEditTeam(id) {
  const t = teams.find(x => x.id === id);
  if (!t) return;
  document.getElementById('edit-team-id').value            = id;
  document.getElementById('edit-team-display').textContent = t.id + ' — ' + t.school;
  document.getElementById('edit-team-pass').value          = '';
  document.getElementById('edit-team-balance').value       = t.balance;
  refreshEditLoginStatus(t);
  document.getElementById('modal-edit-team').classList.remove('hidden');
}

function refreshEditLoginStatus(t) {
  const el  = document.getElementById('edit-login-status');
  const btn = document.getElementById('btn-reset-login');
  if (t.loginLocked) {
    el.textContent  = 'Locked — signed in once';
    el.style.color  = '#e07060';
    btn.textContent = 'Reactivate';
  } else if (t.loggedIn) {
    el.textContent  = 'Logged in';
    el.style.color  = '#a8622f';
    btn.textContent = 'Reset login';
  } else {
    el.textContent  = 'Not logged in';
    el.style.color  = 'rgba(234,223,199,0.4)';
    btn.textContent = 'Reset login';
  }
}

document.getElementById('btn-reset-login').addEventListener('click', () => {
  const id = document.getElementById('edit-team-id').value;
  teams = teams.map(t => t.id === id
    ? { ...t, loggedIn: false, loginLocked: false, loginTime: null }
    : t
  );
  const t = teams.find(x => x.id === id);
  refreshEditLoginStatus(t);
  saveAll();
  syncWriteTeamsSafe(`[admin] reactivated login for ${id}`, id);
  renderTeams();
  toast('Login reactivated for ' + id);
});

document.getElementById('form-edit-team').addEventListener('submit', e => {
  e.preventDefault();
  const id      = document.getElementById('edit-team-id').value;
  const newPass = document.getElementById('edit-team-pass').value.trim();
  const balance = parseInt(document.getElementById('edit-team-balance').value, 10);
  teams = teams.map(t => {
    if (t.id !== id) return t;
    return { ...t, balance: isNaN(balance) ? t.balance : balance, passcode: newPass || t.passcode };
  });
  saveAll();
  renderTeams();
  document.getElementById('modal-edit-team').classList.add('hidden');
  toast('Team updated');
});

function deleteTeam(id) {
  if (!confirm('Remove team ' + id + '?')) return;
  teams = teams.filter(t => t.id !== id);
  saveAll();
  renderTeams();
  updateCountPills();
  toast('Team removed');
}


// ════════════════════════════════════════════════════════════════
// 6. FORGOT PASSCODE
// ════════════════════════════════════════════════════════════════
function renderForgot() {
  forgotReqs = ls('ah_forgot', forgotReqs);
  updateCountPills();
  const tbody = document.getElementById('forgot-tbody');
  if (!forgotReqs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No passcode requests.</td></tr>';
    return;
  }
  tbody.innerHTML = forgotReqs.map((r, i) => `
    <tr>
      <td style="color:rgba(234,223,199,0.35);font-family:'Special Elite',monospace;font-size:11px">${r.time}</td>
      <td class="cell-mono">${r.teamId}</td>
      <td>${r.school || '—'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="resolveForgot(${i})">Mark resolved</button></td>
    </tr>
  `).join('');
}

function resolveForgot(idx) {
  forgotReqs.splice(idx, 1);
  lsSet('ah_forgot', forgotReqs);
  renderForgot();
  toast('Request resolved');
}

document.getElementById('btn-clear-forgot').addEventListener('click', () => {
  if (!confirm('Clear all requests?')) return;
  forgotReqs = [];
  lsSet('ah_forgot', forgotReqs);
  renderForgot();
  toast('Requests cleared');
});


// ════════════════════════════════════════════════════════════════
// 7. AUCTIONEER LOG
// ════════════════════════════════════════════════════════════════
function renderAcLog() {
  acLog = ls('ah_auctioneer_log', acLog);
  const tbody = document.getElementById('ac-log-tbody');
  if (!acLog.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No auctioneer logins recorded.</td></tr>';
    return;
  }
  tbody.innerHTML = acLog.map(e => `
    <tr>
      <td style="color:rgba(234,223,199,0.35);font-family:'Special Elite',monospace;font-size:11px">${e.date || '—'}</td>
      <td style="color:rgba(234,223,199,0.35);font-family:'Special Elite',monospace;font-size:11px">${e.time}</td>
      <td class="cell-mono" style="color:#a8622f">${e.name}</td>
      <td style="font-size:12px;color:rgba(234,223,199,0.3)">${e.device || ''}</td>
    </tr>
  `).join('');
}

document.getElementById('btn-clear-ac-log').addEventListener('click', () => {
  if (!confirm('Clear auctioneer log?')) return;
  acLog = [];
  lsSet('ah_auctioneer_log', acLog);
  renderAcLog();
  toast('Log cleared');
});


// ════════════════════════════════════════════════════════════════
// 8. UNSOLD LOTS
// ════════════════════════════════════════════════════════════════
function renderUnsold() {
  const unsold = lots.filter(l => l.status === 'unsold' || (l.status === 'pending' && sessionState === 'closed'));
  const tbody  = document.getElementById('unsold-tbody');
  if (!unsold.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No unsold lots.</td></tr>';
    return;
  }
  tbody.innerHTML = unsold.map(l => {
    const n = bids.filter(b => b.lotId === l.id).length;
    return `<tr>
      <td class="cell-mono">${l.num}</td>
      <td>${l.title}</td>
      <td class="cell-amount">₹ ${Number(l.floor).toLocaleString()}</td>
      <td style="color:rgba(234,223,199,0.45)">${n} bid${n !== 1 ? 's' : ''}</td>
    </tr>`;
  }).join('');
}


// ════════════════════════════════════════════════════════════════
// 9. RESTART AUCTION
// ════════════════════════════════════════════════════════════════
let restartExtraLots = [];

function renderRestart() {
  const unsold = lots.filter(l => l.status === 'unsold' || (l.status === 'pending' && sessionState === 'closed'));
  const container = document.getElementById('restart-unsold-list');
  container.innerHTML = unsold.length
    ? unsold.map(l => `
        <label class="check-item">
          <input type="checkbox" value="${l.id}" checked>
          <span>${l.num} · ${l.title}
            <span style="color:#a8622f;font-family:'Special Elite',monospace;font-size:11px;margin-left:6px">₹ ${Number(l.floor).toLocaleString()}</span>
          </span>
        </label>
      `).join('')
    : '<p style="color:rgba(234,223,199,0.3);font-size:14px">No unsold lots to carry over.</p>';
}

document.getElementById('btn-restart-add-lot').addEventListener('click', () => {
  const title = document.getElementById('restart-lot-title').value.trim();
  const desc  = document.getElementById('restart-lot-desc').value.trim();
  const floor = parseInt(document.getElementById('restart-lot-floor').value, 10) || 0;
  if (!title) return;
  restartExtraLots.push({ id: 'rx-' + Date.now(), num: 'R' + String(restartExtraLots.length + 1).padStart(2,'0'), title, desc, floor, status: 'pending' });
  document.getElementById('restart-lot-title').value = '';
  document.getElementById('restart-lot-desc').value  = '';
  document.getElementById('restart-lot-floor').value = '';
  toast('Lot queued for new round');
});

document.getElementById('btn-restart-auction').addEventListener('click', () => {
  if (!confirm('Reset the session and carry over selected lots?')) return;
  const checked = [...document.querySelectorAll('#restart-unsold-list input:checked')].map(i => i.value);
  const carried = lots
    .filter(l => checked.includes(l.id))
    .map(l => ({ ...l, status: 'pending', soldTo: null, soldFor: null }));
  lots  = [...carried, ...restartExtraLots];
  bids  = [];
  teams = teams.map(t => ({ ...t, spent: 0, loggedIn: false, loginLocked: false, loginTime: null }));
  restartExtraLots = [];
  saveAll();

  // Navigate to session and reset state
  unlockPostAuction(false);
  setSession('waiting');
  navigateTo('session');   // ← fixes the "have to go back manually" issue
  toast('Auction restarted — ' + lots.length + ' lots loaded');
});


// ════════════════════════════════════════════════════════════════
// 10. OVERSPENT TEAMS
// ════════════════════════════════════════════════════════════════
function getOverspent() { return teams.filter(t => (t.spent || 0) > (t.balance || 0)); }

function renderOverspent() {
  const over  = getOverspent();
  const tbody = document.getElementById('overspent-tbody');
  if (!over.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No overspent teams.</td></tr>';
    return;
  }
  tbody.innerHTML = over.map(t => {
    const won   = bids.filter(b => b.teamId === t.id && b.status === 'won').length;
    const overBy = (t.spent || 0) - (t.balance || 0);
    return `<tr>
      <td class="cell-mono">${t.id}</td>
      <td>${t.school}</td>
      <td class="cell-amount">₹ ${Number(t.balance).toLocaleString()}</td>
      <td class="cell-amount">₹ ${Number(t.spent || 0).toLocaleString()}</td>
      <td class="cell-over">+ ₹ ${Number(overBy).toLocaleString()}</td>
      <td style="color:rgba(234,223,199,0.55)">${won} lot${won !== 1 ? 's' : ''}</td>
    </tr>`;
  }).join('');
}


// ════════════════════════════════════════════════════════════════
// 11. REMOVE LOTS FROM OVERSPENT TEAMS
// ════════════════════════════════════════════════════════════════
let removingTeamId = null;

function renderRemoveLots() {
  const over   = getOverspent();
  const listEl = document.getElementById('remove-team-list');
  if (!over.length) {
    listEl.innerHTML = '<li style="padding:10px;color:rgba(234,223,199,0.25);font-size:13px">No overspent teams.</li>';
    document.getElementById('remove-lots-tbody').innerHTML =
      '<tr><td colspan="4" class="empty-row">No overspent teams.</td></tr>';
    return;
  }
  listEl.innerHTML = over.map(t => `
    <li class="team-pick-item ${removingTeamId === t.id ? 'selected' : ''}"
        onclick="selectRemoveTeam('${t.id}')">${t.id}</li>
  `).join('');
  if (removingTeamId) renderRemoveLotsList();
}

function selectRemoveTeam(id) {
  removingTeamId = id;
  const t = teams.find(x => x.id === id);
  document.getElementById('remove-target-name').textContent = t ? `${t.id} — ${t.school}` : '—';
  renderRemoveLots();
}

function renderRemoveLotsList() {
  const tbody    = document.getElementById('remove-lots-tbody');
  const wonBids  = bids.filter(b => b.teamId === removingTeamId && b.status === 'won');
  if (!wonBids.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No won lots for this team.</td></tr>';
    return;
  }
  tbody.innerHTML = wonBids.map(b => {
    const lot = lots.find(l => l.id === b.lotId);
    return `<tr>
      <td class="cell-mono">${lot?.num || '—'}</td>
      <td>${b.lotTitle || '—'}</td>
      <td class="cell-amount">₹ ${Number(b.amount).toLocaleString()}</td>
      <td style="text-align:right">
        <button class="btn btn-danger btn-sm" onclick="removeLotFromTeam('${b.id}','${b.lotId}',${b.amount})">Remove &amp; refund</button>
      </td>
    </tr>`;
  }).join('');
}

function removeLotFromTeam(bidId, lotId, amount) {
  if (!confirm('Remove this lot and refund ₹' + amount.toLocaleString() + ' to the team?')) return;
  bids  = bids.map(b  => b.id  === bidId ? { ...b, status: 'removed' } : b);
  lots  = lots.map(l  => l.id  === lotId ? { ...l, status: 'unsold', soldTo: null, soldFor: null } : l);
  teams = teams.map(t => t.id  === removingTeamId ? { ...t, spent: Math.max(0, (t.spent || 0) - amount) } : t);
  saveAll();
  renderRemoveLotsList();
  renderOverspent();
  updateCountPills();
  toast('Lot removed — ₹' + Number(amount).toLocaleString() + ' refunded');
}


// ════════════════════════════════════════════════════════════════
// MODALS — close on cancel / backdrop click / Escape
// ════════════════════════════════════════════════════════════════
document.querySelectorAll('.modal-cancel').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.add('hidden'));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
  // Keyboard shortcuts when not in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === ' ') {
    e.preventDefault();
    if      (sessionState === 'live')    btnPause.click();
    else if (sessionState !== 'closed') btnStart.click();
  }
});


// ════════════════════════════════════════════════════════════════
// COUNT PILLS
// ════════════════════════════════════════════════════════════════
function updateCountPills() {
  forgotReqs = ls('ah_forgot', forgotReqs);
  document.getElementById('nav-forgot-count').textContent    = forgotReqs.length || '';
  document.getElementById('nav-overspent-count').textContent = getOverspent().length || '';
}
updateCountPills();


// ════════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════════
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}


// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════
initData();
renderLiveFeed();
