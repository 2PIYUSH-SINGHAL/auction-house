// ── Countdown ─────────────────────────────────────────────
const AUCTION_TIME = new Date('2026-07-31T21:00:00+05:30').getTime();

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

// ── Team form submit ───────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const id   = document.getElementById('auction-id').value.trim().toUpperCase();
  const pass = document.getElementById('passcode').value.trim();

  if (!id || !pass) {
    if (!id) document.getElementById('auction-id').focus();
    else     passcodeInput.focus();
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.textContent = 'Verifying…';
  btn.disabled = true;

  setTimeout(() => {
    showAdmitted(id);
  }, 1400);
});
