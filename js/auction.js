// ════════════════════════════════════════════════════════════════
// AUCTION FLOOR — hack.welham
// ════════════════════════════════════════════════════════════════

const POLL_MS        = 3000;
const GH_POLL_MS     = 30000;

// ── Helpers ────────────────────────────────────────────────────
function ls(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function pad(n) { return String(n).padStart(2, '0'); }
function nowTime() {
  const n = new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
}

// ── Guard: must have a team ID ─────────────────────────────────
const teamId = localStorage.getItem('ah_current_team_id');
if (!teamId) { window.location.replace('../index.html'); }

// ── State ───────────────────────────────────────────────────────
let lots        = [];
let lotsSha     = null;
let team        = null;
let searchQuery = '';

// ── Session status check ───────────────────────────────────────
function readSessionStatus() {
  return AuctionState.status;
}

function applySessionStatus() {
  const status = readSessionStatus();
  const body    = document.getElementById('auction-body');
  const ended   = document.getElementById('session-ended');
  const waiting = document.getElementById('session-waiting');

  if (status === 'live') {
    body.classList.remove('hidden');
    ended.classList.add('hidden');
    waiting.classList.add('hidden');
  } else if (status === 'closed') {
    body.classList.add('hidden');
    waiting.classList.add('hidden');
    ended.classList.remove('hidden');
    document.getElementById('ended-team-id').textContent = teamId;
  } else {
    // waiting or paused
    body.classList.add('hidden');
    ended.classList.add('hidden');
    waiting.classList.remove('hidden');
    document.getElementById('waiting-team-id').textContent = teamId;
  }
}

// Sync session status from GitHub every 30s
async function syncSessionStatus() {
  try {
    await AuctionState.sync();
    applySessionStatus();
  } catch (_) {}
}

// ── Team data ──────────────────────────────────────────────────
function loadTeam() {
  const teams = ls('ah_teams', []);
  team = teams.find(t => t.id === teamId) || null;
}

function getAvailableBalance() {
  if (!team) return 0;
  return (team.balance || 0) - (team.spent || 0);
}

function renderTeamInfo() {
  loadTeam();
  if (!team) return;
  document.getElementById('team-school').textContent    = team.school;
  document.getElementById('team-id-display').textContent = team.id;
  const bal = getAvailableBalance();
  const balEl = document.getElementById('team-balance');
  balEl.textContent = '₹ ' + bal.toLocaleString();
  balEl.classList.toggle('balance-low', bal < 200);
}

// ── Lots ────────────────────────────────────────────────────────
async function loadLots() {
  // Try GitHub first for authoritative state
  try {
    const { data, sha } = await GithubStore.read('data/lots.json');
    lots    = Array.isArray(data) ? data : [];
    lotsSha = sha;
    lsSet('ah_lots', lots);
  } catch (_) {
    // Fall back to localStorage
    lots = ls('ah_lots', []);
  }
}

function renderLots() {
  const grid  = document.getElementById('lot-grid');
  const query = searchQuery.toLowerCase().trim();

  const bids = ls('ah_bids', []);

  // Filter: exclude removed/hidden lots, apply search
  let visible = lots.filter(l => l.status !== 'removed');
  if (query) {
    visible = visible.filter(l =>
      (l.title       || '').toLowerCase().includes(query) ||
      (l.description || '').toLowerCase().includes(query) ||
      (l.id          || '').toLowerCase().includes(query)
    );
  }

  // Update count tag
  const tag = document.getElementById('lot-count-tag');
  tag.textContent = visible.length
    ? `${visible.length} lot${visible.length !== 1 ? 's' : ''}`
    : '';

  if (!visible.length) {
    grid.innerHTML = `<div class="lot-empty">${
      query ? 'No lots match your search.' : 'No lots yet — the auctioneer will add items shortly.'
    }</div>`;
    return;
  }

  grid.innerHTML = visible.map((lot, idx) => {
    const sold      = lot.status === 'sold';
    const isMine    = lot.currentBidder === teamId;
    const topBid    = lot.currentBid || 0;
    const startBid  = lot.startingBid || 0;
    const showAmt   = sold ? lot.soldFor || topBid : (topBid || startBid);
    const bidLabel  = sold
      ? 'Sold for'
      : topBid
        ? 'Current bid'
        : 'Starting bid';
    const badgeClass = sold
      ? 'badge-sold'
      : isMine
        ? 'badge-mine'
        : 'badge-open';
    const badgeText  = sold ? 'sold' : isMine ? 'your bid' : 'open';
    const cardClass  = ['lot-card', sold ? 'lot-sold' : '', isMine ? 'lot-mine' : '']
      .filter(Boolean).join(' ');

    return `
    <div class="${cardClass}" style="animation-delay:${Math.min(idx * 0.04, 0.4)}s">
      <div class="lot-card-top">
        <div class="lot-number">${lot.id}</div>
        <span class="lot-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="lot-title">${lot.title}</div>
      ${lot.description ? `<div class="lot-desc">${lot.description}</div>` : ''}
      <div class="lot-bid-row">
        <div class="lot-bid-info">
          <div class="lot-bid-label">${bidLabel}</div>
          <div class="lot-bid-amount${isMine && !sold ? ' bid-mine' : ''}">
            ₹ ${Number(showAmt).toLocaleString()}
          </div>
        </div>
        ${!sold
          ? `<button class="btn-bid" onclick="openBid('${lot.id}')">Bid ↗</button>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Poll loop ───────────────────────────────────────────────────
function pollLocal() {
  // Re-read lots and team from localStorage (admin may have updated them)
  const fresh = ls('ah_lots', lots);
  if (JSON.stringify(fresh) !== JSON.stringify(lots)) {
    lots = fresh;
    renderLots();
  }
  renderTeamInfo();
  // Check session status in case admin closed it
  const prev = AuctionState.status;
  const raw  = localStorage.getItem('ah_auction');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.status !== prev) {
        AuctionState.status = parsed.status;
        applySessionStatus();
      }
    } catch (_) {}
  }
}

// Also react immediately when admin writes to localStorage from the same browser
window.addEventListener('storage', (e) => {
  if (e.key === 'ah_lots') {
    lots = JSON.parse(e.newValue || '[]');
    renderLots();
  }
  if (e.key === 'ah_teams') {
    renderTeamInfo();
  }
  if (e.key === 'ah_auction') {
    AuctionState.status = (JSON.parse(e.newValue || '{}') || {}).status || AuctionState.status;
    applySessionStatus();
  }
});


// ── Bid modal ───────────────────────────────────────────────────
let activeLotId = null;

function openBid(lotId) {
  const lot = lots.find(l => l.id === lotId);
  if (!lot || lot.status === 'sold') return;
  activeLotId = lotId;

  const topBid  = lot.currentBid || 0;
  const minBid  = (topBid || (lot.startingBid || 0));
  const dispBid = topBid || lot.startingBid || 0;

  document.getElementById('bid-lot-id').textContent    = lot.id;
  document.getElementById('bid-lot-title').textContent  = lot.title;
  const descEl = document.getElementById('bid-lot-desc');
  descEl.textContent = lot.description || '';
  descEl.style.display = lot.description ? 'block' : 'none';

  document.getElementById('bid-current').textContent = '₹ ' + dispBid.toLocaleString();
  document.getElementById('bid-balance').textContent  = '₹ ' + getAvailableBalance().toLocaleString();
  document.getElementById('bid-min-note').textContent = `— min ₹ ${(minBid + 1).toLocaleString()}`;

  const amtInput = document.getElementById('bid-amount');
  amtInput.value = '';
  amtInput.min   = minBid + 1;

  document.getElementById('bid-error').classList.add('hidden');
  document.getElementById('bid-submit').disabled = false;
  document.getElementById('bid-submit').innerHTML = 'Place Bid <em>↗</em>';

  document.getElementById('bid-modal').classList.remove('hidden');
  setTimeout(() => amtInput.focus(), 80);
}

function closeBid() {
  document.getElementById('bid-modal').classList.add('hidden');
  activeLotId = null;
}

document.getElementById('bid-cancel').addEventListener('click', closeBid);

document.getElementById('bid-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('bid-modal')) closeBid();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeBid();
});

document.getElementById('bid-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await submitBid();
});

async function submitBid() {
  const lot = lots.find(l => l.id === activeLotId);
  if (!lot) return;

  const amount  = parseInt(document.getElementById('bid-amount').value, 10);
  const minBid  = (lot.currentBid || lot.startingBid || 0) + 1;
  const balance = getAvailableBalance();
  const errEl   = document.getElementById('bid-error');

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden', 'shake');
    void errEl.offsetWidth;
    errEl.classList.add('shake');
  }

  if (!amount || isNaN(amount) || amount < minBid) {
    showErr(`Bid must be at least ₹ ${minBid.toLocaleString()}`);
    return;
  }
  if (amount > balance) {
    showErr(`Insufficient balance — you have ₹ ${balance.toLocaleString()} available.`);
    return;
  }

  errEl.classList.add('hidden');
  const btn = document.getElementById('bid-submit');
  btn.textContent = 'Placing…';
  btn.disabled = true;

  // Build bid record
  const bid = {
    id:       'bid-' + Date.now(),
    teamId,
    lotId:    lot.id,
    lotTitle: lot.title,
    amount,
    status:   'pending',
    time:     nowTime(),
  };

  // Write bid to localStorage
  const bids = ls('ah_bids', []);
  // Mark any earlier pending bid from this team on this lot as superseded
  const updatedBids = bids.map(b =>
    b.teamId === teamId && b.lotId === lot.id && b.status === 'pending'
      ? { ...b, status: 'outbid' }
      : b
  );
  updatedBids.push(bid);
  lsSet('ah_bids', updatedBids);

  // Optimistically update the lot's current bid in memory + localStorage
  lots = lots.map(l =>
    l.id === lot.id
      ? { ...l, currentBid: amount, currentBidder: teamId }
      : l
  );
  lsSet('ah_lots', lots);

  // Push both to GitHub async (non-blocking)
  (async () => {
    try {
      // Write updated lots
      const newLotSha = await GithubStore.write(
        'data/lots.json', lots, lotsSha,
        `[bid] ${teamId} bid ₹${amount} on ${lot.id}`
      );
      if (newLotSha) lotsSha = newLotSha;

      // Write bids file
      const { data: ghBids, sha: bidsSha } = await GithubStore.read('data/bids.json')
        .catch(() => ({ data: [], sha: null }));
      const mergedBids = [bid, ...(Array.isArray(ghBids) ? ghBids : [])];
      await GithubStore.write('data/bids.json', mergedBids, bidsSha,
        `[bid] ${teamId} — ${lot.title} ₹${amount}`);
    } catch (_) { /* silent — localStorage already updated */ }
  })();

  closeBid();
  renderTeamInfo();
  renderLots();
}


// ── Search ──────────────────────────────────────────────────────
document.getElementById('lot-search').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderLots();
});


// ── Initialise ──────────────────────────────────────────────────
async function init() {
  await AuctionState.sync().catch(() => {});
  applySessionStatus();

  if (AuctionState.isLive()) {
    loadTeam();
    renderTeamInfo();
    await loadLots();
    renderLots();
  }
}

init();

// Local poll: fast, for same-browser updates
setInterval(pollLocal, POLL_MS);

// GitHub poll: slower, for cross-device updates
setInterval(async () => {
  if (!AuctionState.isLive()) {
    await syncSessionStatus();
    return;
  }
  await syncSessionStatus();
  await loadLots();
  renderLots();
  renderTeamInfo();
}, GH_POLL_MS);
