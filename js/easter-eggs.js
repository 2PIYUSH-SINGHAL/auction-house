// ════════════════════════════════════════════════════════════════
// PAINTED COUNTDOWN — subtle fade-up on each digit change
// ════════════════════════════════════════════════════════════════
let prevH = '', prevM = '', prevS = '';
setInterval(() => {
  const h = document.getElementById('cd-hours').textContent;
  const m = document.getElementById('cd-mins').textContent;
  const s = document.getElementById('cd-secs').textContent;
  [['cd-hours', prevH, h], ['cd-mins', prevM, m], ['cd-secs', prevS, s]].forEach(([id, prev, cur]) => {
    if (cur !== prev && prev !== '') {
      const el = document.getElementById(id);
      el.classList.remove('cd-ticking');
      void el.offsetWidth;
      el.classList.add('cd-ticking');
      el.addEventListener('animationend', () => el.classList.remove('cd-ticking'), { once: true });
    }
  });
  prevH = h; prevM = m; prevS = s;
}, 1000);


// ════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════
function toast(msg, duration = 3000) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration + 500);
}

function wobble(el) {
  el.classList.remove('wobbling');
  void el.offsetWidth;
  el.classList.add('wobbling');
  el.addEventListener('animationend', () => el.classList.remove('wobbling'), { once: true });
}


// ════════════════════════════════════════════════════════════════
// EASTER EGGS
// ════════════════════════════════════════════════════════════════

// ── 1. Konami code → Auctioneer overlay ───────────────────────
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let konamiIdx = 0;
const auctioneerView = document.getElementById('auctioneer-view');

function openAuctioneerView() {
  auctioneerView.classList.remove('hidden');
  document.getElementById('auctioneer-name').focus();
}

function closeAuctioneerView() {
  auctioneerView.classList.add('hidden');
  const btn = document.getElementById('auctioneer-submit-btn');
  btn.disabled = false;
  btn.innerHTML = 'Open the Hall <em>↗</em>';
}

document.addEventListener('keydown', (e) => {
  if (e.key === KONAMI[konamiIdx]) {
    konamiIdx++;
    if (konamiIdx === KONAMI.length) {
      konamiIdx = 0;
      e.preventDefault(); // stops the final 'a' from being typed into the focused input
      if (auctioneerView.classList.contains('hidden')) openAuctioneerView();
      else closeAuctioneerView();
    }
  } else {
    konamiIdx = 0;
    if (e.key === KONAMI[0]) konamiIdx = 1;
  }
  if (e.key === 'Escape' && !auctioneerView.classList.contains('hidden')) {
    closeAuctioneerView();
  }
});

document.getElementById('ac-back').addEventListener('click', closeAuctioneerView);

// Auctioneer show/hide password
const acPassInput = document.getElementById('auctioneer-pass');
const acToggle    = document.getElementById('show-toggle-a');
let acPassVisible = false;

acToggle.addEventListener('click', () => {
  acPassVisible = !acPassVisible;
  acPassInput.type = acPassVisible ? 'text' : 'password';
  acToggle.textContent = acPassVisible ? 'hide ⊘' : 'show ◉';
});

const AUCTIONEER_PASS = 'wbsauction';

function showAcError(msg) {
  const el = document.getElementById('ac-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.add('error-shake');
  el.addEventListener('animationend', () => el.classList.remove('error-shake'), { once: true });
}

function clearAcError() {
  const el = document.getElementById('ac-error');
  el.classList.add('hidden');
  el.textContent = '';
}

function logAuctioneerLogin(name) {
  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const entry = {
    name:  name.toUpperCase(),
    time:  `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    date:  now.toLocaleDateString('en-IN'),
    device: navigator.platform || 'unknown',
  };
  // Write to localStorage (admin panel reads from ah_auctioneer_log)
  const logs = JSON.parse(localStorage.getItem('ah_auctioneer_log') || '[]');
  logs.unshift(entry);
  localStorage.setItem('ah_auctioneer_log', JSON.stringify(logs));
  // Also add to login logs so admin sees it in Login Logs section
  const loginLogs = JSON.parse(localStorage.getItem('ah_loginlogs') || '[]');
  loginLogs.unshift({
    time:   entry.time,
    teamId: 'AUCTIONEER',
    status: 'auctioneer',
    device: entry.device,
    note:   'Logged in as ' + entry.name,
  });
  localStorage.setItem('ah_loginlogs', JSON.stringify(loginLogs));
}

// Auctioneer form submit
document.getElementById('auctioneer-form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearAcError();
  const name = document.getElementById('auctioneer-name').value.trim();
  const pass = acPassInput.value.trim();

  if (!name) {
    showAcError('Please enter your name.');
    document.getElementById('auctioneer-name').focus();
    return;
  }
  if (!pass) {
    showAcError('Please enter the auctioneer password.');
    acPassInput.focus();
    return;
  }
  if (pass !== AUCTIONEER_PASS) {
    showAcError('Incorrect password.');
    acPassInput.value = '';
    acPassInput.focus();
    return;
  }

  const btn = document.getElementById('auctioneer-submit-btn');
  btn.textContent = 'Verifying…';
  btn.disabled = true;

  logAuctioneerLogin(name);

  setTimeout(() => {
    closeAuctioneerView();
    sessionStorage.setItem('auctioneer_name', name.toUpperCase());
    window.location.href = 'html/admin.html';
  }, 1400);
});


// ── 2. Crest × 5 → spin + toast ───────────────────────────────
let crestClicks = 0, crestTimer;
document.querySelector('.crest-ring').addEventListener('click', () => {
  crestClicks++;
  clearTimeout(crestTimer);
  crestTimer = setTimeout(() => { crestClicks = 0; }, 1200);
  if (crestClicks >= 5) {
    crestClicks = 0;
    const img = document.querySelector('.crest-ring img');
    img.classList.remove('crest-spinning');
    void img.offsetWidth;
    img.classList.add('crest-spinning');
    img.addEventListener('animationend', () => img.classList.remove('crest-spinning'), { once: true });
    toast('<em>✦</em> Welham Boys — est. 1937 <em>✦</em>');
  }
});


// ── 3. Stamp × 3 → ink splatter ───────────────────────────────
let stampClicks = 0, stampTimer;
document.querySelector('.stamp').addEventListener('click', () => {
  stampClicks++;
  clearTimeout(stampTimer);
  stampTimer = setTimeout(() => { stampClicks = 0; }, 900);

  const splat = document.createElement('div');
  splat.className = 'ink-splat';
  const size = 28 + Math.random() * 36;
  splat.style.cssText = `width:${size}px;height:${size}px;top:${10+Math.random()*60}%;left:${10+Math.random()*60}%;`;
  document.querySelector('.stamp').appendChild(splat);
  splat.addEventListener('animationend', () => splat.remove());

  if (stampClicks >= 3) {
    stampClicks = 0;
    for (let i = 0; i < 6; i++) {
      const big = document.createElement('div');
      big.className = 'ink-splat';
      const s = 48 + Math.random() * 56;
      big.style.cssText = `width:${s}px;height:${s}px;top:${-20+Math.random()*140}%;left:${-20+Math.random()*140}%;animation-delay:${i*0.06}s;`;
      document.querySelector('.stamp').appendChild(big);
      big.addEventListener('animationend', () => big.remove());
    }
    toast('stamped!');
  }
});


// ── 4. Click "Their word is law" → "(literally.)" ─────────────
document.querySelectorAll('.rules-card li').forEach(li => {
  if (li.textContent.includes('Their word is law')) {
    li.style.cursor = 'pointer';
    let done = false;
    li.addEventListener('click', () => {
      if (done) return;
      done = true;
      const span = document.createElement('span');
      span.className = 'literally';
      span.textContent = ' (literally.)';
      li.appendChild(span);
      wobble(li.closest('.card'));
    });
  }
});


// ── 5. Idle 25 s → sticky note card ───────────────────────────
let idleTimer, stickyShown = false;

function resetIdle() {
  clearTimeout(idleTimer);
  if (stickyShown) return;
  idleTimer = setTimeout(showSticky, 25000);
}

function showSticky() {
  stickyShown = true;
  const note = document.createElement('div');
  note.className = 'sticky-note';
  note.innerHTML = '…still there?<br><small style="font-size:13px;opacity:0.55">doors open at 21:00</small>';
  document.body.appendChild(note);
  note.addEventListener('click', () => {
    note.classList.add('leaving');
    note.addEventListener('animationend', () => note.remove(), { once: true });
    stickyShown = false;
    resetIdle();
  });
}

['mousemove','keydown','click','touchstart'].forEach(ev =>
  document.addEventListener(ev, resetIdle, { passive: true })
);
resetIdle();


// ── 6. Masthead title × 7 → confetti ──────────────────────────
let mastheadClicks = 0, mastheadTimer;
const CONFETTI_COLORS = ['#eadfc7','#e0d2b3','#a8622f','#3a2a1a','#c8a87a','#f5e6c8'];

document.querySelector('.brand-name').addEventListener('click', () => {
  mastheadClicks++;
  clearTimeout(mastheadTimer);
  mastheadTimer = setTimeout(() => { mastheadClicks = 0; }, 1500);
  if (mastheadClicks >= 7) {
    mastheadClicks = 0;
    for (let i = 0; i < 44; i++) {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText = `
        left:${18+Math.random()*64}vw;
        background:${CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)]};
        --cx:${(Math.random()-0.5)*220}px;
        --cr:${Math.random()*720-360}deg;
        --cd:${1.3+Math.random()*1.5}s;
        --cdelay:${Math.random()*0.55}s;
        width:${6+Math.random()*7}px;
        height:${10+Math.random()*8}px;
        border-radius:${Math.random()>0.5?'50%':'1px'};
      `;
      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }
    toast('<em>✦</em> hack.welham <em>✦</em>');
  }
});


// ── 7. Countdown click × 3 → slot-machine scramble ────────────
let cdClicks = 0, cdTimer;
document.querySelector('.countdown-display').addEventListener('click', () => {
  cdClicks++;
  clearTimeout(cdTimer);
  cdTimer = setTimeout(() => { cdClicks = 0; }, 800);
  if (cdClicks >= 3) {
    cdClicks = 0;
    const ids = ['cd-hours','cd-mins','cd-secs'];
    let ticks = 0;
    const scramble = setInterval(() => {
      ids.forEach(id => {
        const el = document.getElementById(id);
        el.textContent = String(Math.floor(Math.random()*100)).padStart(2,'0');
        el.classList.remove('cd-scrambling');
        void el.offsetWidth;
        el.classList.add('cd-scrambling');
      });
      if (++ticks >= 8) {
        clearInterval(scramble);
        ids.forEach(id => document.getElementById(id).classList.remove('cd-scrambling'));
        updateCountdown();
      }
    }, 80);
  }
});


// ── 8. "forgot passcode?" → recovery overlay ──────────────────
const forgotOverlay  = document.getElementById('forgot-overlay');
const forgotFormState    = document.getElementById('forg-form-state');
const forgotSuccessState = document.getElementById('forg-success-state');

function openForgotOverlay() {
  forgotFormState.classList.remove('hidden');
  forgotSuccessState.classList.add('hidden');
  document.getElementById('forg-id').value     = '';
  document.getElementById('forg-school').value = '';
  document.getElementById('forg-error').classList.add('hidden');
  document.getElementById('forg-error').textContent = '';
  const btn = document.getElementById('forg-submit-btn');
  btn.disabled = false;
  btn.innerHTML = 'Send request <em>↗</em>';
  forgotOverlay.classList.remove('hidden');
  // Pre-fill Auction ID if already typed in the login form
  const typedId = document.getElementById('auction-id').value.trim().toUpperCase();
  if (typedId) document.getElementById('forg-id').value = typedId;
  setTimeout(() => {
    const focusEl = document.getElementById('forg-id').value ? document.getElementById('forg-school') : document.getElementById('forg-id');
    focusEl.focus();
  }, 80);
}

function closeForgotOverlay() {
  forgotOverlay.classList.add('hidden');
}

document.querySelector('.forgot-link').addEventListener('click', (e) => {
  e.preventDefault();
  openForgotOverlay();
});

document.getElementById('forg-back').addEventListener('click', closeForgotOverlay);

document.getElementById('forg-done-btn').addEventListener('click', closeForgotOverlay);

forgotOverlay.addEventListener('click', (e) => {
  if (e.target === forgotOverlay) closeForgotOverlay();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !forgotOverlay.classList.contains('hidden')) {
    closeForgotOverlay();
  }
});

document.getElementById('forgot-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const id     = document.getElementById('forg-id').value.trim().toUpperCase();
  const school = document.getElementById('forg-school').value.trim();
  const errEl  = document.getElementById('forg-error');

  if (!id || !school) {
    errEl.textContent = !id ? 'Please enter your Auction ID.' : 'Please enter your school name.';
    errEl.classList.remove('hidden');
    errEl.classList.add('error-shake');
    errEl.addEventListener('animationend', () => errEl.classList.remove('error-shake'), { once: true });
    (!id ? document.getElementById('forg-id') : document.getElementById('forg-school')).focus();
    return;
  }

  errEl.classList.add('hidden');
  const btn = document.getElementById('forg-submit-btn');
  btn.textContent = 'Sending…';
  btn.disabled = true;

  const now  = new Date();
  const pad  = n => String(n).padStart(2, '0');
  const entry = {
    time:   `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    date:   now.toLocaleDateString('en-IN'),
    teamId: id,
    school,
    status: 'pending',
  };

  // Write to localStorage immediately
  const reqs = JSON.parse(localStorage.getItem('ah_forgot') || '[]');
  reqs.unshift(entry);
  localStorage.setItem('ah_forgot', JSON.stringify(reqs));

  // Also push to GitHub so the auctioneer can git-pull and see it
  (async () => {
    try {
      const { data, sha } = await GithubStore.read('data/passcode-requests.json');
      const updated = [entry, ...(Array.isArray(data) ? data : [])];
      await GithubStore.write('data/passcode-requests.json', updated, sha,
        `[passcode-req] ${id} — ${entry.date} ${entry.time}`);
    } catch (_) { /* silent — localStorage is the fallback */ }
  })();

  setTimeout(() => {
    forgotFormState.classList.add('hidden');
    forgotSuccessState.classList.remove('hidden');
  }, 800);
});


// ── 9. Double-click ad cards → swap positions ─────────────────
const adRow = document.querySelector('.ad-row');
if (adRow) {
  let lastDbl = 0;
  adRow.addEventListener('dblclick', () => {
    const now = Date.now();
    if (now - lastDbl < 300) return;
    lastDbl = now;
    const [a, b] = adRow.children;
    if (!a || !b) return;
    adRow.appendChild(a);
    wobble(a); wobble(b);
  });
}


// ── 10. Click "Form № 02" eyebrow × 3 → slip note ─────────────
let formEyebrowClicks = 0, formEyebrowTimer;
const formEyebrow = document.querySelector('.form-eyebrow');
let slipShown = false;

if (formEyebrow) {
  formEyebrow.style.cursor = 'pointer';
  formEyebrow.addEventListener('click', () => {
    formEyebrowClicks++;
    clearTimeout(formEyebrowTimer);
    formEyebrowTimer = setTimeout(() => { formEyebrowClicks = 0; }, 1200);

    if (formEyebrowClicks >= 3 && !slipShown) {
      formEyebrowClicks = 0;
      slipShown = true;
      const slip = document.createElement('div');
      slip.className = 'slip-note';
      slip.innerHTML = 'Form № 01 was misplaced.<small>We do not speak of this.</small>';
      document.body.appendChild(slip);
      slip.addEventListener('click', () => {
        slip.classList.add('leaving');
        slip.addEventListener('animationend', () => { slip.remove(); slipShown = false; }, { once: true });
      });
      setTimeout(() => {
        if (document.body.contains(slip)) {
          slip.classList.add('leaving');
          slip.addEventListener('animationend', () => { slip.remove(); slipShown = false; }, { once: true });
        }
      }, 6000);
    }
  });
}
