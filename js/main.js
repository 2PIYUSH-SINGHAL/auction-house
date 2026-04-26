// ── Sync auction status in background ─────────────────────
// AuctionState is already loaded from localStorage by auction-state.js.
// Refresh from GitHub silently so the login page always has the latest status.
(async () => {
  try { await AuctionState.sync(); } catch (_) {}
})();

// ── Countdown ─────────────────────────────────────────────
const AUCTION_TIME = window.AUCTION_START_MS;

function updateCountdown() {
  const diff = AUCTION_TIME - Date.now();
  if (diff <= 0) {
    document.getElementById('cd-hours').textContent = '00';
    document.getElementById('cd-mins').textContent  = '00';
    document.getElementById('cd-secs').textContent  = '00';
    document.querySelector('.countdown-target').textContent = 'Doors are open — enter now';
    return;
  }
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  document.getElementById('cd-hours').textContent = String(h).padStart(2, '0');
  document.getElementById('cd-mins').textContent  = String(m).padStart(2, '0');
  document.getElementById('cd-secs').textContent  = String(s).padStart(2, '0');
}

updateCountdown();
setInterval(updateCountdown, 1000);

// ── Show admitted view ─────────────────────────────────────
function showAdmitted(teamId) {
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('admitted-view').classList.remove('hidden');
  document.getElementById('admitted-team-id').textContent = teamId;
}

// ── Show / hide passcode ───────────────────────────────────
const passcodeInput = document.getElementById('passcode');
const showToggle    = document.getElementById('show-toggle');
let passVisible = false;

showToggle.addEventListener('click', () => {
  passVisible = !passVisible;
  passcodeInput.type = passVisible ? 'text' : 'password';
  showToggle.textContent = passVisible ? 'hide ⊘' : 'show ◉';
});

// ── Custom checkbox ────────────────────────────────────────
let remember = true;
const rememberBox = document.getElementById('remember-box');

function toggleRemember() {
  remember = !remember;
  rememberBox.textContent = remember ? '✓' : '';
  rememberBox.setAttribute('aria-checked', String(remember));
}

rememberBox.addEventListener('click', toggleRemember);
rememberBox.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleRemember(); }
});

// ── Error display ──────────────────────────────────────────
function showFormError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('error-shake');
  el.addEventListener('animationend', () => el.classList.remove('error-shake'), { once: true });
}

function clearFormError() {
  const el = document.getElementById('login-error');
  el.classList.add('hidden');
  el.textContent = '';
}

// ── Load teams (GitHub raw → localStorage fallback) ────────
let teamsCache = null;

async function loadTeams() {
  if (teamsCache) return teamsCache;

  // Try localStorage first (admin panel writes here)
  const stored = localStorage.getItem('ah_teams');
  if (stored) {
    try { teamsCache = JSON.parse(stored); return teamsCache; } catch (_) {}
  }

  // Try GitHub raw URL
  try {
    teamsCache = await GithubStore.readRaw('data/teams.json');
    return teamsCache;
  } catch (_) {}

  return [];
}

// ── Record login attempt to localStorage ──────────────────
function recordLoginAttempt(teamId, status, note) {
  const logs = JSON.parse(localStorage.getItem('ah_loginlogs') || '[]');
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  logs.unshift({
    time:   `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    teamId,
    status,
    device: navigator.platform || 'unknown',
    note,
  });
  if (logs.length > 300) logs.pop();
  localStorage.setItem('ah_loginlogs', JSON.stringify(logs));
}

// ── Team form submit ───────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFormError();

  const id   = document.getElementById('auction-id').value.trim().toUpperCase();
  const pass = document.getElementById('passcode').value.trim();

  if (!id) {
    showFormError('Please enter your Auction ID.');
    document.getElementById('auction-id').focus();
    return;
  }
  if (!pass) {
    showFormError('Please enter your Passcode.');
    passcodeInput.focus();
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.textContent = 'Verifying…';
  btn.disabled = true;

  try {
    const teams = await loadTeams();

    if (teams.length === 0) {
      // No team data available — warn but allow (pre-event testing)
      recordLoginAttempt(id, 'warn', 'No team data loaded');
      setTimeout(() => showAdmitted(id), 800);
      return;
    }

    const team = teams.find(t => t.id === id);

    if (!team) {
      recordLoginAttempt(id, 'fail', 'Unknown ID');
      showFormError('Auction ID not recognised. Check for typos or contact the auctioneer.');
      btn.textContent = 'Enter the hall ↗';
      btn.disabled = false;
      document.getElementById('auction-id').focus();
      return;
    }

    if (team.loginLocked) {
      recordLoginAttempt(id, 'fail', 'Account locked — already signed in');
      showFormError('This account has already been used to sign in. Contact the auctioneer to reactivate it.');
      btn.textContent = 'Enter the hall ↗';
      btn.disabled = false;
      document.getElementById('auction-id').focus();
      return;
    }

    if (team.passcode !== pass) {
      recordLoginAttempt(id, 'fail', 'Wrong passcode');
      showFormError('Incorrect Passcode. Passwords are case-sensitive.');
      btn.textContent = 'Enter the hall ↗';
      btn.disabled = false;
      passcodeInput.value = '';
      passcodeInput.focus();
      return;
    }

    // Valid — mark logged in and lock the account
    team.loggedIn    = true;
    team.loginLocked = true;
    team.loginTime   = new Date().toISOString();
    const updated = teams.map(t => t.id === id ? team : t);
    localStorage.setItem('ah_teams', JSON.stringify(updated));
    teamsCache = updated;

    // Push updated lock state to GitHub so it persists across devices
    (async () => {
      try {
        const { sha } = await GithubStore.read('data/teams.json');
        await GithubStore.write('data/teams.json', updated, sha,
          `[login] ${id} signed in — account locked`);
      } catch (_) { /* silent — localStorage is source of truth */ }
    })();

    recordLoginAttempt(id, 'success', team.school);

    // Record forgot passcode request if the link was clicked 3 times
    // (easter-eggs.js tracks this via forgotClicksForLogin)
    if (window._recordForgotRequest) {
      window._recordForgotRequest(id, team.school);
    }

    setTimeout(() => showAdmitted(id), 800);

  } catch (err) {
    // Network error or parse error — fall back to allowing entry
    console.warn('Team validation error:', err);
    recordLoginAttempt(id, 'warn', 'Validation error: ' + err.message);
    setTimeout(() => showAdmitted(id), 800);
  }
});

// ── "forgot passcode?" records a request ──────────────────
// Called from easter-eggs.js after 3 clicks
window._recordForgotRequest = function(teamId, school) {
  const reqs = JSON.parse(localStorage.getItem('ah_forgot') || '[]');
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  reqs.unshift({
    time:   `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    teamId: teamId || document.getElementById('auction-id').value.trim().toUpperCase() || 'unknown',
    school: school || '—',
  });
  localStorage.setItem('ah_forgot', JSON.stringify(reqs));
};
