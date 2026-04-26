// ════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════
const auctioneerName = sessionStorage.getItem('auctioneer_name') || 'Auctioneer';
document.getElementById('auctioneer-display').textContent = auctioneerName;

let sessionState = 'waiting'; // waiting | live | paused | closed

function load(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let teams      = load('ah_teams',      []);
let lots       = load('ah_lots',       []);
let bids       = load('ah_bids',       []);
let loginLogs  = load('ah_loginlogs',  []);
let forgotReqs = load('ah_forgot',     []);

function saveAll() {
  save('ah_teams',     teams);
  save('ah_lots',      lots);
  save('ah_bids',      bids);
  save('ah_loginlogs', loginLogs);
  save('ah_forgot',    forgotReqs);
}


// ════════════════════════════════════════════════════════════════
// CLOCK
// ════════════════════════════════════════════════════════════════
function updateClock() {
  const n = new Date();
  document.getElementById('live-clock').textContent =
    `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())} IST`;
}
function pad(n) { return String(n).padStart(2, '0'); }
updateClock();
setInterval(updateClock, 1000);


// ════════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════════
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', () => {
    if (item.classList.contains('locked')) return;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('section-' + item.dataset.section).classList.add('active');
    refreshSection(item.dataset.section);
  });
});

function refreshSection(name) {
  if (name === 'session')    renderStats();
  if (name === 'lots')       renderLots();
  if (name === 'bids')       renderBids();
  if (name === 'login-logs') renderLoginLogs();
  if (name === 'teams')      renderTeams();
  if (name === 'forgot')     renderForgot();
  if (name === 'unsold')     renderUnsold();
  if (name === 'restart')    renderRestart();
  if (name === 'overspent')  renderOverspent();
  if (name === 'remove-lots') renderRemoveLots();
}


// ════════════════════════════════════════════════════════════════
// 1. SESSION
// ════════════════════════════════════════════════════════════════
const statusDot  = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const btnStart   = document.getElementById('btn-start');
const btnPause   = document.getElementById('btn-pause');
const btnEnd     = document.getElementById('btn-end');
const sessionPill = document.getElementById('nav-session-pill');

function setSession(state) {
  sessionState = state;
  statusDot.className = 'status-dot';
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
    btnEnd.disabled = false;
    sessionPill.classList.add('live');
    sessionPill.textContent = 'live';
    addLoginLog('SYSTEM', 'Session opened by ' + auctioneerName, 'system');
    unlockPostAuction(false);
  } else if (state === 'paused') {
    statusText.classList.add('paused');
    statusDot.classList.add('paused');
    statusText.textContent = 'Session paused';
    btnStart.textContent = 'Resume';
    btnStart.disabled = false;
    btnPause.disabled = true;
    addLoginLog('SYSTEM', 'Session paused', 'system');
  } else if (state === 'closed') {
    statusText.textContent = 'Session closed';
    btnStart.disabled = true;
    btnPause.disabled = true;
    btnEnd.disabled = true;
    addLoginLog('SYSTEM', 'Session closed by ' + auctioneerName, 'system');
    unlockPostAuction(true);
    toast('Session closed — post-auction sections unlocked');
  } else {
    statusText.textContent = 'Waiting to open';
    btnStart.textContent = 'Open session';
    btnStart.disabled = false;
    btnPause.disabled = true;
    btnEnd.disabled = true;
  }
  renderStats();
}

function unlockPostAuction(unlock) {
  document.querySelectorAll('.post-auction').forEach(el => {
    el.classList.toggle('locked', !unlock);
  });
}

btnStart.addEventListener('click', () => {
  if (sessionState === 'waiting' || sessionState === 'paused') setSession('live');
});
btnPause.addEventListener('click', () => {
  if (sessionState === 'live') setSession('paused');
});
btnEnd.addEventListener('click', () => {
  if (!confirm('Close the session? Post-auction sections will unlock.')) return;
  setSession('closed');
});

function renderStats() {
  document.getElementById('stat-teams').textContent  = teams.length;
  document.getElementById('stat-lots').textContent   = lots.length;
  document.getElementById('stat-bids').textContent   = bids.length;
  const raised = bids.filter(b => b.status === 'won').reduce((s, b) => s + b.amount, 0);
  document.getElementById('stat-raised').textContent = '₹ ' + raised.toLocaleString();
}

setSession('waiting');


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
      <td style="color:rgba(234,223,199,0.45);font-size:13px">${l.desc}</td>
      <td class="cell-amount">₹ ${Number(l.floor).toLocaleString()}</td>
      <td><span class="badge badge-${l.status}">${l.status}</span></td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="editLot('${l.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteLot('${l.id}')" style="margin-left:6px">Delete</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('btn-add-lot').addEventListener('click', () => openLotModal());

function openLotModal(id) {
  const modal = document.getElementById('modal-lot');
  document.getElementById('lot-edit-id').value = id || '';
  document.getElementById('modal-lot-title').innerHTML = id ? 'Edit <em>lot</em>' : 'Add <em>lot</em>';
  if (id) {
    const l = lots.find(x => x.id === id);
    document.getElementById('lot-num').value   = l.num;
    document.getElementById('lot-title').value = l.title;
    document.getElementById('lot-desc').value  = l.desc;
    document.getElementById('lot-floor').value = l.floor;
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
}

document.getElementById('form-lot').addEventListener('submit', e => {
  e.preventDefault();
  const editId = document.getElementById('lot-edit-id').value;
  const data = {
    id:    editId || Date.now().toString(),
    num:   document.getElementById('lot-num').value.trim() || String(lots.length + 1).padStart(2,'0'),
    title: document.getElementById('lot-title').value.trim(),
    desc:  document.getElementById('lot-desc').value.trim(),
    floor: parseInt(document.getElementById('lot-floor').value, 10) || 0,
    status: editId ? lots.find(l => l.id === editId)?.status || 'pending' : 'pending',
  };
  if (!data.title) return;
  if (editId) lots = lots.map(l => l.id === editId ? data : l);
  else lots.push(data);
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
      <td style="color:rgba(234,223,199,0.35);font-family:'Special Elite',monospace;font-size:11px">${b.time}</td>
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
  const ts = document.getElementById('bid-team');
  const ls = document.getElementById('bid-lot');
  ts.innerHTML = teams.map(t => `<option value="${t.id}">${t.id} — ${t.school}</option>`).join('');
  ls.innerHTML = lots.map(l => `<option value="${l.id}">${l.num} · ${l.title}</option>`).join('');
}

document.getElementById('form-bid').addEventListener('submit', e => {
  e.preventDefault();
  const teamId = document.getElementById('bid-team').value;
  const lotId  = document.getElementById('bid-lot').value;
  const amount = parseInt(document.getElementById('bid-amount').value, 10) || 0;
  const status = document.getElementById('bid-status').value;
  const lot    = lots.find(l => l.id === lotId);
  const now    = new Date();
  const time   = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  bids.push({ id: Date.now().toString(), teamId, lotId, lotTitle: lot?.title, amount, status, time });

  if (status === 'won' && lot) {
    lots = lots.map(l => l.id === lotId ? { ...l, status: 'sold', soldTo: teamId, soldFor: amount } : l);
    const team = teams.find(t => t.id === teamId);
    if (team) {
      team.spent = (team.spent || 0) + amount;
    }
  }

  saveAll();
  renderBids();
  document.getElementById('modal-bid').classList.add('hidden');
  updateCountPills();
  toast('Bid recorded');
});


// ════════════════════════════════════════════════════════════════
// 4. LOGIN LOGS
// ════════════════════════════════════════════════════════════════
function addLoginLog(teamId, note, status) {
  const now = new Date();
  loginLogs.unshift({
    time:   `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    teamId,
    status: status || 'success',
    device: navigator.platform || 'unknown',
    note,
  });
  if (loginLogs.length > 200) loginLogs.pop();
  saveAll();
}

function renderLoginLogs() {
  const tbody = document.getElementById('logs-tbody');
  if (!loginLogs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No login attempts recorded.</td></tr>';
    return;
  }
  tbody.innerHTML = loginLogs.map(l => `
    <tr>
      <td style="color:rgba(234,223,199,0.35);font-family:'Special Elite',monospace;font-size:11px">${l.time}</td>
      <td class="cell-mono">${l.teamId}</td>
      <td><span class="badge badge-${l.status === 'success' ? 'active' : l.status === 'system' ? 'pending' : 'outbid'}">${l.status}</span>
          <span style="font-size:12px;color:rgba(234,223,199,0.4);margin-left:8px">${l.note || ''}</span></td>
      <td style="font-size:12px;color:rgba(234,223,199,0.3)">${l.device}</td>
    </tr>
  `).join('');
}

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  if (!confirm('Clear all login logs?')) return;
  loginLogs = [];
  saveAll();
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
  tbody.innerHTML = teams.map(t => `
    <tr>
      <td class="cell-mono">${t.id}</td>
      <td>${t.school}</td>
      <td class="cell-amount">₹ ${Number(t.balance).toLocaleString()}</td>
      <td class="cell-amount">₹ ${Number(t.spent || 0).toLocaleString()}</td>
      <td><span class="badge badge-${t.loggedIn ? 'active' : 'pending'}">${t.loggedIn ? 'logged in' : 'waiting'}</span></td>
      <td style="text-align:right">
        <button class="btn btn-ghost btn-sm" onclick="openEditTeam('${t.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" style="margin-left:6px" onclick="deleteTeam('${t.id}')">Remove</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('btn-add-team').addEventListener('click', () => {
  document.getElementById('form-team').reset();
  document.getElementById('modal-team').classList.remove('hidden');
});

document.getElementById('form-team').addEventListener('submit', e => {
  e.preventDefault();
  const id      = document.getElementById('team-id').value.trim().toUpperCase();
  const school  = document.getElementById('team-school').value.trim();
  const pass    = document.getElementById('team-pass').value.trim();
  const balance = parseInt(document.getElementById('team-balance').value, 10) || 1000;
  if (!id || !school) return;
  if (teams.find(t => t.id === id)) { toast('Team ID already exists'); return; }
  teams.push({ id, school, pass, balance, spent: 0, loggedIn: false });
  saveAll();
  renderTeams();
  updateCountPills();
  document.getElementById('modal-team').classList.add('hidden');
  toast('Team added');
});

function openEditTeam(id) {
  const t = teams.find(x => x.id === id);
  if (!t) return;
  document.getElementById('edit-team-id').value       = id;
  document.getElementById('edit-team-display').textContent = t.id + ' — ' + t.school;
  document.getElementById('edit-team-pass').value     = '';
  document.getElementById('edit-team-balance').value  = t.balance;
  document.getElementById('edit-login-status').textContent = t.loggedIn ? 'Logged in' : 'Not logged in';
  document.getElementById('modal-edit-team').classList.remove('hidden');
}

document.getElementById('btn-reset-login').addEventListener('click', () => {
  const id = document.getElementById('edit-team-id').value;
  const t  = teams.find(x => x.id === id);
  if (!t) return;
  t.loggedIn = false;
  document.getElementById('edit-login-status').textContent = 'Not logged in';
  saveAll();
  toast('Login reset for ' + id);
});

document.getElementById('form-edit-team').addEventListener('submit', e => {
  e.preventDefault();
  const id      = document.getElementById('edit-team-id').value;
  const newPass = document.getElementById('edit-team-pass').value.trim();
  const balance = parseInt(document.getElementById('edit-team-balance').value, 10);
  teams = teams.map(t => {
    if (t.id !== id) return t;
    return {
      ...t,
      balance: isNaN(balance) ? t.balance : balance,
      pass:    newPass || t.pass,
    };
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
// 6. FORGOT PASSCODE REQUESTS
// ════════════════════════════════════════════════════════════════
function renderForgot() {
  const tbody = document.getElementById('forgot-tbody');
  updateCountPills();
  if (!forgotReqs.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No passcode requests.</td></tr>';
    return;
  }
  tbody.innerHTML = forgotReqs.map((r, i) => `
    <tr>
      <td style="color:rgba(234,223,199,0.35);font-family:'Special Elite',monospace;font-size:11px">${r.time}</td>
      <td class="cell-mono">${r.teamId}</td>
      <td>${r.school || '—'}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="resolveForgot(${i})">Mark resolved</button>
      </td>
    </tr>
  `).join('');
}

function resolveForgot(idx) {
  forgotReqs.splice(idx, 1);
  saveAll();
  renderForgot();
  toast('Request resolved');
}

document.getElementById('btn-clear-forgot').addEventListener('click', () => {
  if (!confirm('Clear all forgot-passcode requests?')) return;
  forgotReqs = [];
  saveAll();
  renderForgot();
  toast('Requests cleared');
});


// ════════════════════════════════════════════════════════════════
// 7. UNSOLD LOTS
// ════════════════════════════════════════════════════════════════
function renderUnsold() {
  const unsold = lots.filter(l => l.status === 'unsold' || (l.status === 'pending' && sessionState === 'closed'));
  const tbody  = document.getElementById('unsold-tbody');
  if (!unsold.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No unsold lots.</td></tr>';
    return;
  }
  tbody.innerHTML = unsold.map(l => {
    const lotBids = bids.filter(b => b.lotId === l.id).length;
    return `<tr>
      <td class="cell-mono">${l.num}</td>
      <td>${l.title}</td>
      <td class="cell-amount">₹ ${Number(l.floor).toLocaleString()}</td>
      <td style="color:rgba(234,223,199,0.45)">${lotBids} bid${lotBids !== 1 ? 's' : ''}</td>
    </tr>`;
  }).join('');
}


// ════════════════════════════════════════════════════════════════
// 8. RESTART AUCTION
// ════════════════════════════════════════════════════════════════
let restartExtraLots = [];

function renderRestart() {
  const unsold = lots.filter(l => l.status === 'unsold' || (l.status === 'pending' && sessionState === 'closed'));
  const container = document.getElementById('restart-unsold-list');
  if (!unsold.length) {
    container.innerHTML = '<p style="color:rgba(234,223,199,0.3);font-size:14px">No unsold lots to carry over.</p>';
  } else {
    container.innerHTML = unsold.map(l => `
      <label class="check-item">
        <input type="checkbox" value="${l.id}" checked>
        <span>${l.num} · ${l.title} <span style="color:#a8622f;font-family:'Special Elite',monospace;font-size:11px">(₹ ${Number(l.floor).toLocaleString()})</span></span>
      </label>
    `).join('');
  }
}

document.getElementById('btn-restart-add-lot').addEventListener('click', () => {
  const title = document.getElementById('restart-lot-title').value.trim();
  const desc  = document.getElementById('restart-lot-desc').value.trim();
  const floor = parseInt(document.getElementById('restart-lot-floor').value, 10) || 0;
  if (!title) return;
  restartExtraLots.push({ id: 'rx' + Date.now(), num: 'R' + (restartExtraLots.length + 1), title, desc, floor, status: 'pending' });
  document.getElementById('restart-lot-title').value = '';
  document.getElementById('restart-lot-desc').value  = '';
  document.getElementById('restart-lot-floor').value = '';
  toast('Lot added to new round');
});

document.getElementById('btn-restart-auction').addEventListener('click', () => {
  if (!confirm('This will reset the session and carry over selected lots. Continue?')) return;
  const checked = [...document.querySelectorAll('#restart-unsold-list input:checked')].map(i => i.value);
  const carried = lots.filter(l => checked.includes(l.id)).map(l => ({ ...l, status: 'pending', soldTo: null, soldFor: null }));
  lots = [...carried, ...restartExtraLots];
  bids = [];
  teams.forEach(t => { t.spent = 0; t.loggedIn = false; });
  restartExtraLots = [];
  saveAll();
  setSession('waiting');
  unlockPostAuction(false);
  renderRestart();
  toast('Auction restarted with ' + lots.length + ' lots');
});


// ════════════════════════════════════════════════════════════════
// 9. OVERSPENT TEAMS
// ════════════════════════════════════════════════════════════════
function getOverspent() {
  return teams.filter(t => (t.spent || 0) > (t.balance || 0));
}

function renderOverspent() {
  const over  = getOverspent();
  const tbody = document.getElementById('overspent-tbody');
  document.getElementById('nav-overspent-count').textContent = over.length || '';

  if (!over.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No overspent teams.</td></tr>';
    return;
  }

  tbody.innerHTML = over.map(t => {
    const wonLots = bids.filter(b => b.teamId === t.id && b.status === 'won').length;
    const overBy  = (t.spent || 0) - (t.balance || 0);
    return `<tr>
      <td class="cell-mono">${t.id}</td>
      <td>${t.school}</td>
      <td class="cell-amount">₹ ${Number(t.balance).toLocaleString()}</td>
      <td class="cell-amount">₹ ${Number(t.spent || 0).toLocaleString()}</td>
      <td class="cell-over">+ ₹ ${Number(overBy).toLocaleString()}</td>
      <td style="color:rgba(234,223,199,0.55)">${wonLots} lot${wonLots !== 1 ? 's' : ''}</td>
    </tr>`;
  }).join('');
}


// ════════════════════════════════════════════════════════════════
// 10. REMOVE LOTS FROM OVERSPENT TEAMS
// ════════════════════════════════════════════════════════════════
let removingTeamId = null;

function renderRemoveLots() {
  const over = getOverspent();
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
  document.getElementById('remove-target-name').textContent = t ? t.id + ' — ' + t.school : '—';
  renderRemoveLots();
  renderRemoveLotsList();
}

function renderRemoveLotsList() {
  const tbody = document.getElementById('remove-lots-tbody');
  const wonBids = bids.filter(b => b.teamId === removingTeamId && b.status === 'won');
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
        <button class="btn btn-danger btn-sm" onclick="removeLotFromTeam('${b.id}','${b.lotId}',${b.amount})">Remove</button>
      </td>
    </tr>`;
  }).join('');
}

function removeLotFromTeam(bidId, lotId, amount) {
  if (!confirm('Remove this lot from the team and refund the amount?')) return;
  bids = bids.map(b => b.id === bidId ? { ...b, status: 'removed' } : b);
  lots = lots.map(l => l.id === lotId ? { ...l, status: 'unsold', soldTo: null, soldFor: null } : l);
  const team = teams.find(t => t.id === removingTeamId);
  if (team) team.spent = Math.max(0, (team.spent || 0) - amount);
  saveAll();
  renderRemoveLotsList();
  renderOverspent();
  updateCountPills();
  toast('Lot removed and amount refunded');
}


// ════════════════════════════════════════════════════════════════
// MODALS — cancel buttons & backdrop click
// ════════════════════════════════════════════════════════════════
document.querySelectorAll('.modal-cancel').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.add('hidden'));
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
  }
});


// ════════════════════════════════════════════════════════════════
// PILL COUNTS
// ════════════════════════════════════════════════════════════════
function updateCountPills() {
  const fc = document.getElementById('nav-forgot-count');
  fc.textContent = forgotReqs.length || '';

  const oc = document.getElementById('nav-overspent-count');
  oc.textContent = getOverspent().length || '';
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
