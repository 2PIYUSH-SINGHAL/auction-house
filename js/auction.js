// ════════════════════════════════════════════════════════════════
// AUCTION FLOOR — hack.welham
// MongoDB Atlas Data API is the single source of truth.
// ════════════════════════════════════════════════════════════════

const POLL_MS = 2000;

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
let lots  = [];
let teams = [];
let searchQ = '';

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
      ? (lot.soldFor || lot.currentBid || lot.floor || 0)
      : (lot.currentBid || lot.floor || 0);
    const bidLabel = sold
      ? 'Sold for'
      : lot.currentBid ? 'Current bid' : 'Floor price';
    const badge    = sold ? 'sold' : isMine ? 'your bid' : 'open';
    const badgeCls = sold ? 'badge-sold' : isMine ? 'badge-mine' : 'badge-open';
    const cardCls  = ['lot-card', sold ? 'lot-sold' : '', isMine ? 'lot-mine' : '']
      .filter(Boolean).join(' ');

    return `
    <div class="${cardCls}" style="animation-delay:${Math.min(i * 0.04, 0.5)}s">
      <div class="lot-card-top">
        <span class="lot-number">${lot.num || lot.id}</span>
        <span class="lot-badge ${badgeCls}">${badge}</span>
      </div>
      <div class="lot-title">${lot.title}</div>
      ${lot.desc ? `<div class="lot-desc">${lot.desc}</div>` : ''}
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

// ── Poll: MongoDB every 2s ─────────────────────────────────────
async function poll() {
  try {
    const [freshAuction, freshLots, freshTeams] = await Promise.all([
      MongoStore.findOne('auction', { id: 'session' }),
      MongoStore.find('lots'),
      MongoStore.find('teams'),
    ]);

    const newStatus = (freshAuction && freshAuction.status) || 'waiting';
    AuctionState.status = newStatus;
    applyStatus(newStatus);

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

  const topBid = lot.currentBid || lot.floor || 0;

  document.getElementById('bid-lot-id').textContent    = lot.num || lot.id;
  document.getElementById('bid-lot-title').textContent  = lot.title;
  const descEl = document.getElementById('bid-lot-desc');
  descEl.textContent   = lot.desc || '';
  descEl.style.display = lot.desc ? '' : 'none';

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

  const amount = parseInt(document.getElementById('bid-amount').value, 10);
  const floor  = lot.floor || 0;
  const errEl  = document.getElementById('bid-error');

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden', 'shake');
    void errEl.offsetWidth;
    errEl.classList.add('shake');
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    showErr('Enter a valid amount.');
    return;
  }
  if (amount < floor) {
    showErr(`Bid must meet the floor price: ₹ ${floor.toLocaleString('en-IN')}`);
    return;
  }
  if (lot.currentBid && amount <= lot.currentBid) {
    showErr(`Bid must be above the current bid: ₹ ${lot.currentBid.toLocaleString('en-IN')}`);
    return;
  }

  errEl.classList.add('hidden');
  const btn = document.getElementById('bid-submit');
  btn.textContent = 'Placing…';
  btn.disabled = true;

  // Optimistic local update
  lots = lots.map(l =>
    l.id === lot.id
      ? { ...l, currentBid: amount, currentBidder: teamId }
      : l
  );
  renderTeamInfo();
  renderLots();
  closeBid();

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
    // 1. Insert bid record
    await MongoStore.insertOne('bids', bid);

    // 2. Update lot's currentBid — only if still the highest
    const freshLot = await MongoStore.findOne('lots', { id: lot.id });
    const ghBid = freshLot ? (freshLot.currentBid || 0) : 0;
    if (amount >= ghBid) {
      await MongoStore.updateOne(
        'lots',
        { id: lot.id },
        { $set: { currentBid: amount, currentBidder: teamId } }
      );
    }

    // Refresh lots from DB
    lots = await MongoStore.find('lots');
    renderLots();
    updateLastSync();
  } catch (e) {
    const errEl2 = document.getElementById('bid-error');
    errEl2.textContent = 'Could not save bid to database. Tell the auctioneer: ' + e.message;
    errEl2.classList.remove('hidden');
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
  await AuctionState.sync().catch(() => {});
  applyStatus(AuctionState.status);

  if (AuctionState.status !== 'closed') {
    try {
      const [lData, tData] = await Promise.all([
        MongoStore.find('lots'),
        MongoStore.find('teams'),
      ]);
      lots  = Array.isArray(lData) ? lData : [];
      teams = Array.isArray(tData) ? tData : [];
    } catch (_) {}

    renderTeamInfo();
    renderLots();
    updateLastSync();
  }
}

init();
setInterval(poll, POLL_MS);
