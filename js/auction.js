// ════════════════════════════════════════════════════════════════
// AUCTION FLOOR — hack.welham
// GitHub JSON files are the single source of truth.
// readRaw() is used for all polls (cache-busted, no auth needed).
// GithubStore.read/write() is used only for writes (needs SHA).
// ════════════════════════════════════════════════════════════════

const POLL_MS = 8000;

// ── Helpers ────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function nowTime() {
  const n = new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
}

// ── Guard ──────────────────────────────────────────────────────
const teamId = localStorage.getItem('ah_current_team_id');
if (!teamId) { window.location.replace('../index.html'); }

// ── State ───────────────────────────────────────────────────────
let lots     = [];
let teams    = [];
let lotsSha  = null;
let bidsSha  = null;
let ghBids   = [];
let searchQ  = '';

function getTeam()    { return teams.find(t => t.id === teamId) || null; }
function getBalance() {
  const t = getTeam();
  return t ? (t.balance || 0) - (t.spent || 0) : 0;
}

// ── Session status ─────────────────────────────────────────────
function applyStatus(status) {
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
    body.classList.add('hidden');
    ended.classList.add('hidden');
    waiting.classList.remove('hidden');
    document.getElementById('waiting-team-id').textContent = teamId;
  }
}

// ── Render team info ───────────────────────────────────────────
function renderTeamInfo() {
  const t = getTeam();
  if (!t) return;
  document.getElementById('team-school').textContent     = t.school;
  document.getElementById('team-id-display').textContent = t.id;
  const bal   = getBalance();
  const balEl = document.getElementById('team-balance');
  balEl.textContent = '₹ ' + bal.toLocaleString('en-IN');
  balEl.classList.toggle('balance-low', bal < 200);
}

// ── Render lot grid ────────────────────────────────────────────
function renderLots() {
  const grid  = document.getElementById('lot-grid');
  const query = searchQ.toLowerCase().trim();

  let visible = lots.filter(l => l.status !== 'removed');
  if (query) {
    visible = visible.filter(l =>
      (l.title       || '').toLowerCase().includes(query) ||
      (l.description || '').toLowerCase().includes(query) ||
      (l.id          || '').toLowerCase().includes(query)
    );
  }

  const countEl = document.getElementById('lot-count-tag');
  countEl.textContent = visible.length
    ? `${visible.length} lot${visible.length !== 1 ? 's' : ''}`
    : '';

  if (!visible.length) {
    grid.innerHTML = `<div class="lot-empty">${
      query
        ? 'No lots match your search.'
        : 'No lots yet — the auctioneer will add items shortly.'
    }</div>`;
    return;
  }

  grid.innerHTML = visible.map((lot, i) => {
    const sold     = lot.status === 'sold';
    const isMine   = lot.currentBidder === teamId;
    const dispAmt  = sold
      ? (lot.soldFor || lot.currentBid || lot.startingBid || 0)
      : (lot.currentBid || lot.startingBid || 0);
    const bidLabel = sold
      ? 'Sold for'
      : lot.currentBid ? 'Current bid' : 'Starting bid';
    const badge    = sold ? 'sold' : isMine ? 'your bid' : 'open';
    const badgeCls = sold ? 'badge-sold' : isMine ? 'badge-mine' : 'badge-open';
    const cardCls  = ['lot-card', sold ? 'lot-sold' : '', isMine ? 'lot-mine' : '']
      .filter(Boolean).join(' ');

    return `
    <div class="${cardCls}" style="animation-delay:${Math.min(i * 0.04, 0.5)}s">
      <div class="lot-card-top">
        <span class="lot-number">${lot.id}</span>
        <span class="lot-badge ${badgeCls}">${badge}</span>
      </div>
      <div class="lot-title">${lot.title}</div>
      ${lot.description ? `<div class="lot-desc">${lot.description}</div>` : ''}
      <div class="lot-footer">
        <div>
          <div class="lot-bid-label">${bidLabel}</div>
          <div class="lot-bid-amount${isMine && !sold ? ' bid-mine' : ''}">
            ₹ ${Number(dispAmt).toLocaleString('en-IN')}
          </div>
        </div>
        ${!sold
          ? `<button class="btn-bid" onclick="openBid('${lot.id}')">Bid ↗</button>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Poll: GitHub readRaw (cache-busted, no auth, no rate limit) ─
async function poll() {
  try {
    const [freshAuction, freshLots, freshTeams] = await Promise.all([
      GithubStore.readRaw('data/auction.json'),
      GithubStore.readRaw('data/lots.json'),
      GithubStore.readRaw('data/teams.json'),
    ]);

    // Update session status
    const newStatus = freshAuction.status || 'waiting';
    AuctionState.status = newStatus;
    applyStatus(newStatus);

    // Update lots + teams
    lots  = Array.isArray(freshLots)  ? freshLots  : lots;
    teams = Array.isArray(freshTeams) ? freshTeams : teams;

    if (newStatus === 'live') {
      renderTeamInfo();
      renderLots();
      updateLastSync();
    }
  } catch (_) { /* network error — keep showing stale data */ }
}

function updateLastSync() {
  const el = document.getElementById('last-sync');
  if (el) el.textContent = 'Updated ' + nowTime();
}

// ── Bid modal ───────────────────────────────────────────────────
let activeLotId = null;

function openBid(lotId) {
  const lot = lots.find(l => l.id === lotId);
  if (!lot || lot.status === 'sold') return;
  activeLotId = lotId;

  const topBid = lot.currentBid || lot.startingBid || 0;

  document.getElementById('bid-lot-id').textContent    = lot.id;
  document.getElementById('bid-lot-title').textContent  = lot.title;
  const descEl = document.getElementById('bid-lot-desc');
  descEl.textContent    = lot.description || '';
  descEl.style.display  = lot.description ? '' : 'none';

  document.getElementById('bid-current').textContent = '₹ ' + topBid.toLocaleString('en-IN');
  document.getElementById('bid-balance').textContent  = '₹ ' + getBalance().toLocaleString('en-IN');
  document.getElementById('bid-min-note').textContent = `min ₹ ${(topBid + 1).toLocaleString('en-IN')}`;

  const amtEl = document.getElementById('bid-amount');
  amtEl.value = '';
  amtEl.min   = topBid + 1;

  document.getElementById('bid-error').classList.add('hidden');
  const btn = document.getElementById('bid-submit');
  btn.disabled = false;
  btn.innerHTML = 'Place Bid <em>↗</em>';

  document.getElementById('bid-modal').classList.remove('hidden');
  setTimeout(() => amtEl.focus(), 80);
}

function closeBid() {
  document.getElementById('bid-modal').classList.add('hidden');
  activeLotId = null;
}

document.getElementById('bid-cancel').addEventListener('click', closeBid);
document.getElementById('bid-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('bid-modal')) closeBid();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeBid();
});

document.getElementById('bid-form').addEventListener('submit', async e => {
  e.preventDefault();
  await submitBid();
});

async function submitBid() {
  const lot = lots.find(l => l.id === activeLotId);
  if (!lot) return;

  const amount  = parseInt(document.getElementById('bid-amount').value, 10);
  const minBid  = (lot.currentBid || lot.startingBid || 0) + 1;
  const balance = getBalance();
  const errEl   = document.getElementById('bid-error');

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden', 'shake');
    void errEl.offsetWidth;
    errEl.classList.add('shake');
  }

  if (!amount || isNaN(amount) || amount < minBid) {
    showErr(`Bid must be at least ₹ ${minBid.toLocaleString('en-IN')}`);
    return;
  }
  if (amount > balance) {
    showErr(`Not enough balance — you have ₹ ${balance.toLocaleString('en-IN')} left.`);
    return;
  }

  errEl.classList.add('hidden');
  const btn = document.getElementById('bid-submit');
  btn.textContent = 'Placing…';
  btn.disabled = true;

  // Optimistic local update so bidder sees result immediately
  lots = lots.map(l =>
    l.id === lot.id
      ? { ...l, currentBid: amount, currentBidder: teamId }
      : l
  );
  renderTeamInfo();
  renderLots();
  closeBid();

  // Write bids.json then lots.json — sequential (not concurrent) so a
  // conflict on one doesn't leave the other in an inconsistent state.
  // writeRetry re-reads the current SHA and retries up to 4× on conflict.
  const bid = {
    id:       'bid-' + Date.now(),
    teamId,
    lotId:    lot.id,
    lotTitle: lot.title,
    amount,
    status:   'pending',
    time:     nowTime(),
  };

  try {
    // 1. Append bid to bids.json
    const { data: savedBids } = await GithubStore.writeRetry(
      'data/bids.json',
      current => [bid, ...(Array.isArray(current) ? current : [])],
      `[bid] ${teamId} — ${lot.title} ₹${amount}`
    );
    ghBids = savedBids;

    // 2. Update lot's currentBid in lots.json — only if this bid is
    //    still higher than whatever is now in GitHub (another team may
    //    have outbid between our read and write).
    const { data: savedLots } = await GithubStore.writeRetry(
      'data/lots.json',
      current => (Array.isArray(current) ? current : []).map(l => {
        if (l.id !== lot.id) return l;
        // Only take this bid if it is genuinely the highest
        const ghBid = l.currentBid || 0;
        return amount >= ghBid
          ? { ...l, currentBid: amount, currentBidder: teamId }
          : l; // someone else bid higher while we were writing
      }),
      `[bid] ${teamId} — ${lot.title} ₹${amount}`
    );

    lots = savedLots;
    renderLots();
    updateLastSync();
  } catch (e) {
    errEl.textContent = 'Could not sync bid to GitHub after several retries. ' +
      'Your bid was recorded locally — tell the auctioneer.';
    errEl.classList.remove('hidden');
    document.getElementById('bid-modal').classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Place Bid <em>↗</em>';
  }
}

// ── Search ──────────────────────────────────────────────────────
document.getElementById('lot-search').addEventListener('input', e => {
  searchQ = e.target.value;
  renderLots();
});

// ── Init ────────────────────────────────────────────────────────
async function init() {
  // Sync session status first
  await AuctionState.sync().catch(() => {});
  applyStatus(AuctionState.status);

  if (AuctionState.status !== 'closed') {
    // Load all data from GitHub once (gets SHAs for later writes)
    try {
      const [{ data: lData, sha: lSha }, { data: tData }, { data: bData, sha: bSha }] =
        await Promise.all([
          GithubStore.read('data/lots.json'),
          GithubStore.read('data/teams.json'),
          GithubStore.read('data/bids.json').catch(() => ({ data: [], sha: null })),
        ]);
      lots    = Array.isArray(lData) ? lData : [];
      teams   = Array.isArray(tData) ? tData : [];
      ghBids  = Array.isArray(bData) ? bData : [];
      lotsSha = lSha;
      bidsSha = bSha;
    } catch (_) {}

    renderTeamInfo();
    renderLots();
    updateLastSync();
  }
}

init();

// Continuous poll — GitHub readRaw with cache-busting timestamp
// readRaw hits the CDN (no auth, no rate limit)
setInterval(poll, POLL_MS);
