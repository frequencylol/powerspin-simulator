/* POWERSPIN frontend — LIVE MIRROR when possible, local RNG fallback */

const STORAGE_KEY = 'ps_sim_v3';

let state = {
  balance: 100,
  tickets: [],
  nextId: 1,
  stats: { wins: 0, losses: 0, totalStaked: 0, totalWon: 0 },
  draft: [],
  betType: 'NUMBER',
  selectedNumbers: [],
  selectedZone: null,
  lastSettledDrawId: null,
  drawHistory: [],
  mode: 'LIVE',          // LIVE | LOCAL
  lastLiveFetch: 0,
  liveStatus: '…'
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (_) {}
  // Older versions stored estimates as if they were official draws. Remove
  // those rows so the history remains an auditable list of real results.
  const seen = new Set();
  state.drawHistory = (state.drawHistory || []).filter((draw) => {
    if (draw.source !== 'LIVE') return false;
    const id = String(draw.drawId);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    balance: state.balance,
    tickets: state.tickets.slice(0, 80),
    nextId: state.nextId,
    stats: state.stats,
    lastSettledDrawId: state.lastSettledDrawId,
    drawHistory: state.drawHistory.slice(0, 50),
    mode: state.mode
  }));
}
load();

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const elBalance = $('#balance');
const elTimer = $('#timer');
const elTicketList = $('#ticketList');
const elTicketTotal = $('#ticketTotal');
const elTicketCount = $('#ticketCount');
const elSubmit = $('#submitTicketBtn');
const elBetConfig = $('#betConfig');
const elWheels = $$('.wheel');
const elDrawId = $('#drawId');
const elDrawStatus = $('#drawStatus');
const elBanner = $('#lastResultBanner');
const elDrawHistory = $('#drawHistory');
const elTicketsList = $('#ticketsList');
const elToast = $('#toast');

function toast(msg, type = '') {
  elToast.textContent = msg;
  elToast.className = 'toast ' + type;
  setTimeout(() => elToast.classList.add('hidden'), 4000);
}
function fmt(n) { return '€' + Number(n).toFixed(2); }

function refreshHeader() {
  elBalance.textContent = fmt(state.balance);
  $('#statWins').textContent = state.stats.wins;
  $('#statLosses').textContent = state.stats.losses;
  $('#statStaked').textContent = fmt(state.stats.totalStaked);
  $('#statWon').textContent = fmt(state.stats.totalWon);
  const modeEl = $('#modeBadge');
  if (modeEl) {
    modeEl.textContent = state.mode === 'LIVE' ? 'LIVE MIRROR' : 'LOCAL RNG';
    modeEl.className = 'mode-badge ' + (state.mode === 'LIVE' ? 'live' : 'local');
  }
}

function refreshDraft() {
  elTicketList.innerHTML = '';
  let total = 0;
  state.draft.forEach((b, i) => {
    total += b.stake;
    const li = document.createElement('li');
    li.innerHTML = `<span>${betLabel(b)}</span><span>${fmt(b.stake)} <button data-i="${i}">✕</button></span>`;
    elTicketList.appendChild(li);
  });
  elTicketTotal.textContent = fmt(total);
  elTicketCount.textContent = state.draft.length;
  elSubmit.disabled = state.draft.length === 0;
  elTicketList.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => { state.draft.splice(+btn.dataset.i, 1); refreshDraft(); };
  });
}

function betLabel(b) {
  switch (b.type) {
    case 'NUMBER':
    case 'NUMBERS': return `Αριθμοί [${(b.numbers || []).join(',')}]`;
    case 'SYMBOL': return 'Σύμβολο';
    case 'ZONE': return `Ζώνη ${b.zone}`;
    case 'OVER': return 'Over 12.5';
    case 'UNDER': return 'Under 12.5';
    case 'AT_LEAST_ONE_SYMBOL': return '≥1 Σύμβολο';
    case 'NO_SYMBOL': return 'Χωρίς Σύμβολο';
    case 'SAME_NUMBER_2': return 'Ίδιος x2';
    case 'SAME_NUMBER_3': return 'Ίδιος x3';
    default: return b.type;
  }
}

function renderBetConfig() {
  const t = state.betType;
  elBetConfig.innerHTML = '';
  if (t === 'NUMBER' || t === 'NUMBERS') {
    const maxPick = t === 'NUMBER' ? 1 : 12;
    const grid = document.createElement('div');
    grid.className = 'numbers-grid';
    for (let n = 1; n <= 24; n++) {
      const btn = document.createElement('button');
      btn.className = 'num-btn ' + (ZONE_OF[n] || '');
      btn.textContent = n;
      if (state.selectedNumbers.includes(n)) btn.classList.add('selected');
      btn.onclick = () => {
        if (state.selectedNumbers.includes(n))
          state.selectedNumbers = state.selectedNumbers.filter(x => x !== n);
        else if (t === 'NUMBER') state.selectedNumbers = [n];
        else if (state.selectedNumbers.length < maxPick) state.selectedNumbers.push(n);
        renderBetConfig();
      };
      grid.appendChild(btn);
    }
    elBetConfig.appendChild(grid);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = t === 'NUMBERS'
      ? `Επίλεξε 2/3/4/6/8/12 (τώρα: ${state.selectedNumbers.length})`
      : (state.selectedNumbers[0] ? `Επιλεγμένο: ${state.selectedNumbers[0]}` : 'Διάλεξε 1 αριθμό');
    elBetConfig.appendChild(hint);
  } else if (t === 'ZONE') {
    const row = document.createElement('div');
    row.className = 'zone-btns';
    for (const z of ['RED', 'GREEN', 'BLUE']) {
      const btn = document.createElement('button');
      btn.className = 'zone-btn ' + z + (state.selectedZone === z ? ' selected' : '');
      btn.textContent = z;
      btn.onclick = () => { state.selectedZone = z; renderBetConfig(); };
      row.appendChild(btn);
    }
    elBetConfig.appendChild(row);
  } else {
    const hints = {
      SYMBOL: 'Σύμβολο SPIN στον 1ο τροχό (x8)',
      OVER: 'Over 12.5 — 13–24 (x2). Σύμβολο = χάσιμο.',
      UNDER: 'Under 12.5 — 1–12 (x2). Σύμβολο = χάσιμο.',
      AT_LEAST_ONE_SYMBOL: '≥1 σύμβολο στους 3 τροχούς (x3)',
      NO_SYMBOL: 'Κανένα σύμβολο στους 3 (x1.2)',
      SAME_NUMBER_2: 'Ίδιος αριθμός σε 2 τροχούς (x9)',
      SAME_NUMBER_3: 'Ίδιος αριθμός και στους 3 (x700)'
    };
    elBetConfig.innerHTML = `<div class="hint">${hints[t] || t}</div>`;
  }
}

$$('#betTabs .tab').forEach(tab => {
  tab.onclick = () => {
    $$('#betTabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.betType = tab.dataset.type;
    state.selectedNumbers = [];
    state.selectedZone = null;
    renderBetConfig();
  };
});

$$('.stake-btns button').forEach(b => {
  b.onclick = () => { $('#stakeInput').value = b.dataset.stake; };
});

$('#addBetBtn').onclick = () => {
  const stake = parseFloat($('#stakeInput').value);
  if (!(stake > 0)) return toast('Μη έγκυρο ποσό');
  const t = state.betType;
  let bet = { type: t, stake };
  if (t === 'NUMBER' || t === 'NUMBERS') {
    const nums = state.selectedNumbers.slice();
    if (t === 'NUMBER' && nums.length !== 1) return toast('Διάλεξε 1 αριθμό');
    if (t === 'NUMBERS' && ![2, 3, 4, 6, 8, 12].includes(nums.length))
      return toast('Επίτρεπτα: 2,3,4,6,8,12');
    bet.numbers = nums;
    bet.type = nums.length === 1 ? 'NUMBER' : 'NUMBERS';
  } else if (t === 'ZONE') {
    if (!state.selectedZone) return toast('Διάλεξε ζώνη');
    bet.zone = state.selectedZone;
  }
  state.draft.push(bet);
  state.selectedNumbers = [];
  state.selectedZone = null;
  refreshDraft();
  renderBetConfig();
  toast('Προστέθηκε');
};

$('#clearTicketBtn').onclick = () => { state.draft = []; refreshDraft(); };

$('#submitTicketBtn').onclick = () => {
  if (!state.draft.length) return;
  const total = state.draft.reduce((s, b) => s + b.stake, 0);
  if (total > state.balance) return toast('Ανεπαρκές υπόλοιπο', 'lose');
  state.balance = +(state.balance - total).toFixed(2);
  state.stats.totalStaked = +(state.stats.totalStaked + total).toFixed(2);
  const ticket = {
    id: state.nextId++,
    bets: state.draft.slice(),
    totalStake: +total.toFixed(2),
    status: 'PENDING',
    createdAt: Date.now(),
    drawId: null,
    result: null
  };
  state.tickets.unshift(ticket);
  state.draft = [];
  refreshDraft();
  refreshHeader();
  renderTickets();
  save();
  toast('Εκδόθηκε Δελτίο #' + ticket.id, 'win');
  elDrawStatus.textContent = 'Δελτίο σε αναμονή επόμενης κλήρωσης…';
};

function paintWheels(wheels, spinning = false) {
  wheels.forEach((w, i) => {
    const el = elWheels[i];
    if (!el) return;
    el.className = 'wheel';
    if (spinning) {
      el.classList.add('spinning');
      el.querySelector('.face').textContent = '•';
      el.querySelector('.meta').textContent = '';
      return;
    }
    if (w.drawPowerSpinSymbol) {
      el.classList.add('SYMBOL');
      el.querySelector('.face').textContent = '★';
      el.querySelector('.meta').textContent = 'SPIN';
    } else {
      el.classList.add(w.drawPowerSpinZone);
      el.querySelector('.face').textContent = w.drawNumber;
      el.querySelector('.meta').textContent =
        (w.drawPowerSpinZone || '') + ' · ' + (w.drawPowerSpinOverUnder || '');
    }
  });
}

function renderDrawHistory() {
  elDrawHistory.innerHTML = '';
  for (const h of state.drawHistory.slice(0, 25)) {
    const row = document.createElement('div');
    row.className = 'hist-row';
    const chips = (h.wheels || []).map(w => {
      if (w.drawPowerSpinSymbol) return `<span class="chip SYMBOL">★</span>`;
      return `<span class="chip ${w.drawPowerSpinZone}">${w.drawNumber}</span>`;
    }).join('');
    const src = h.source === 'LIVE' ? ' <span style="color:#47f041;font-size:10px">LIVE</span>' : '';
    row.innerHTML = `<span class="nums">${chips}</span><span>#${h.drawId}${src}</span>`;
    elDrawHistory.appendChild(row);
  }
}

function renderTickets() {
  elTicketsList.innerHTML = '';
  for (const t of state.tickets.slice(0, 30)) {
    const row = document.createElement('div');
    row.className = 'tix-row';
    let extra = '';
    if (t.status === 'WIN' && t.result) extra = ` +${fmt(t.result.evaled.totalPayout)}`;
    else if (t.status === 'LOSE') extra = ` -${fmt(t.totalStake)}`;
    row.innerHTML = `
      <span>#${t.id} · ${fmt(t.totalStake)}${extra}</span>
      <span class="status ${t.status}">${t.status}</span>`;
    row.style.cursor = 'pointer';
    row.onclick = () => showTicketDetail(t);
    elTicketsList.appendChild(row);
  }
}

function showTicketDetail(t) {
  let msg = `Δελτίο #${t.id} [${t.status}]\nStake ${fmt(t.totalStake)}\n`;
  for (const b of t.bets) msg += '• ' + betLabel(b) + ' ' + fmt(b.stake) + '\n';
  if (t.result) {
    msg += `Draw #${t.drawId}\nPayout ${fmt(t.result.evaled.totalPayout)} · Net ${fmt(t.result.evaled.net)}\n`;
    for (const r of t.result.evaled.results)
      msg += (r.win ? '✓' : '✗') + ' ' + r.detail + (r.win ? ` x${r.mult}=${fmt(r.payout)}` : '') + '\n';
  }
  alert(msg);
}

function settleWithWheels(wheels, drawId, source) {
  paintWheels(wheels, false);
  elDrawId.textContent = 'Draw #' + drawId + (source === 'LIVE' ? ' · LIVE' : ' · LOCAL');
  elDrawStatus.textContent = new Date().toLocaleTimeString() + ' · ' + source;

  state.drawHistory.unshift({ drawId, wheels, ts: Date.now(), source });
  renderDrawHistory();

  const pending = state.tickets.filter(t => t.status === 'PENDING');
  let anyWin = false, totalPaid = 0, totalLost = 0;

  for (const t of pending) {
    const evaled = evaluateTicket(t.bets, wheels);
    t.status = evaled.totalPayout > 0 ? 'WIN' : 'LOSE';
    t.drawId = drawId;
    t.result = { wheels, evaled, settledAt: Date.now(), source };
    state.balance = +(state.balance + evaled.totalPayout).toFixed(2);
    state.stats.totalWon = +(state.stats.totalWon + evaled.totalPayout).toFixed(2);
    if (evaled.totalPayout > 0) {
      state.stats.wins++;
      anyWin = true;
      totalPaid += evaled.totalPayout;
    } else {
      state.stats.losses++;
      totalLost += t.totalStake;
    }
  }

  if (pending.length) {
    if (anyWin) {
      elBanner.className = 'result-banner win';
      elBanner.textContent = `ΚΕΡΔΟΣ! +${fmt(totalPaid)}`;
      toast(`Κέρδισες ${fmt(totalPaid)}!`, 'win');
    } else {
      elBanner.className = 'result-banner lose';
      elBanner.textContent = `ΧΑΣΙΜΟ −${fmt(totalLost)}`;
      toast(`Χάσιμο −${fmt(totalLost)}`, 'lose');
    }
  } else {
    elBanner.className = 'result-banner';
    elBanner.style.background = '#2a2040';
    elBanner.textContent = source === 'LIVE'
      ? 'LIVE κλήρωση — χωρίς ανοιχτά δελτία'
      : 'Κλήρωση (χωρίς δελτία)';
    elBanner.classList.remove('hidden');
  }

  state.lastSettledDrawId = drawId;
  refreshHeader();
  renderTickets();
  save();
}


// ─── Core flow ───────────────────────────────────────────────────────────────
// 1. BEFORE the 4-min boundary: local RNG spins (prediction / sim draw)
// 2. Tickets pending for that drawId settle on that local result immediately
// 3. AFTER official result lands: fetch LIVE, compare, tag history LIVE/MISS
//    and if user wants pure live settle, re-score only still-open tickets

let predictedForBoundary = null;   // { boundary, drawId, wheels }
let boundaryFired = 0;

function boundaryDrawId(boundaryMs) {
  // stable synthetic id from boundary timestamp (seconds)
  return Math.floor(boundaryMs / 1000);
}

/** Pre-draw: use server prediction system or fall back to local RNG */
async function preDrawLocal(boundaryMs) {
  if (predictedForBoundary && predictedForBoundary.boundary === boundaryMs) return;

  const drawId = boundaryDrawId(boundaryMs);
  let wheels;
  let source = state.mode === 'LOCAL' ? 'LOCAL' : 'RNG_ESTIMATE';

  // Try to get prediction from server
  try {
    const response = await fetch('/api/prediction');
    if (response.ok) {
      const data = await response.json();
      if (data.wheels && Array.isArray(data.wheels)) {
        wheels = data.wheels;
        source = 'SERVER_' + (data.type || 'PREDICT');
        console.log('Using server prediction:', data.type);
      }
    }
  } catch (e) {
    console.log('Server prediction unavailable, using local RNG');
  }

  // Fallback to local RNG if server prediction fails
  if (!wheels) {
    wheels = drawFull();
    source = 'LOCAL_PREDICT';
  }

  predictedForBoundary = { boundary: boundaryMs, drawId, wheels, source };

  paintWheels([{}, {}, {}], true);
  elDrawStatus.textContent = 'Προβλέψη γύρου…';
  state.liveStatus = 'PRE-DRAW · ' + source + ' for #' + drawId;

  setTimeout(() => {
    // A prediction is only an estimate. Never write it into draw history or
    // settle tickets; only the official PowerSpin response can do that.
    if (state.mode === 'LOCAL') {
      settleWithWheels(wheels, drawId, 'LOCAL');
      elDrawStatus.textContent = 'Τοπική προσομοίωση · LOCAL RNG';
      state.liveStatus = 'LOCAL simulation #' + drawId;
    } else {
      paintWheels(wheels, false);
      elDrawId.textContent = 'Εκτίμηση επόμενης κλήρωσης';
      elDrawStatus.textContent = 'Εκτίμηση RNG · αναμονή επίσημου αποτελέσματος';
      state.liveStatus = 'RNG estimate · not official';
      elBanner.className = 'result-banner';
      elBanner.style.background = '#2a2040';
      elBanner.textContent = 'ΕΚΤΙΜΗΣΗ RNG — όχι επίσημο αποτέλεσμα';
      elBanner.classList.remove('hidden');
    }
  }, 1400);
}

/** After draw window: pull official result and compare / overlay */
async function verifyLiveAgainstPredict() {
  const live = await fetchLiveResult();
  if (!live || !live.wheels || !live.drawId) {
    state.liveStatus = (state.liveStatus || '') + ' · API offline';
    return false;
  }

  const liveId = String(live.drawId);

  // Already fully verified this official id
  if (state.drawHistory.some(h => String(h.drawId) === liveId && h.source === 'LIVE')) {
    state.liveStatus = 'LIVE verified · #' + liveId;
    return true;
  }

  // Compare only for transparency; this cannot make the next RNG predictable.
  let matchCount = 0;
  if (predictedForBoundary && predictedForBoundary.wheels) {
    const a = predictedForBoundary.wheels;
    const b = live.wheels;
    matchCount = a.reduce((count, w, i) => count + (
      w.drawPowerSpinSymbol === b[i]?.drawPowerSpinSymbol &&
      w.drawNumber === b[i]?.drawNumber ? 1 : 0
    ), 0);
  }
  const match = matchCount === 3;

  // Paint official result
  paintWheels(live.wheels, false);
  elDrawId.textContent = 'Draw #' + live.drawId + ' · LIVE';
  elDrawStatus.textContent = new Date().toLocaleTimeString() + ' · OFFICIAL';

  // Push / update history with LIVE row
  state.drawHistory = state.drawHistory.filter(h => String(h.drawId) !== liveId);
  state.drawHistory.unshift({
    drawId: live.drawId,
    wheels: live.wheels,
    ts: Date.now(),
    source: 'LIVE',
    matchedPredict: match
  });
  renderDrawHistory();

  elBanner.className = 'result-banner';
  elBanner.style.background = '#2a2040';
  elBanner.textContent = predictedForBoundary
    ? `LIVE αποτέλεσμα · ${matchCount}/3 τροχοί συνέπεσαν τυχαία με την εκτίμηση`
    : 'LIVE αποτέλεσμα φορτώθηκε';
  elBanner.classList.remove('hidden');
  state.liveStatus = 'LIVE #' + liveId + (predictedForBoundary ? ` · estimate ${matchCount}/3` : '');

  // Submit result to server for learning
  submitResultToServer(live.drawId, live.wheels);

  // Optional: settle any tickets still PENDING on the official result
  const stillPending = state.tickets.filter(t => t.status === 'PENDING');
  if (stillPending.length) {
    settleWithWheels(live.wheels, live.drawId, 'LIVE');
  }

  state.lastSettledDrawId = live.drawId;
  save();
  refreshHeader();
  return true;
}

/** Submit live result to server for pattern learning */
async function submitResultToServer(drawId, wheels) {
  try {
    await fetch('/api/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drawId, wheels })
    });
    console.log('Result submitted to server for learning');
  } catch (e) {
    console.log('Failed to submit result to server:', e);
  }
}

async function tryLiveSettle() {
  // kept name for boot call — just verify
  return verifyLiveAgainstPredict();
}

async function localSettle() {
  // manual force: treat as immediate pre-draw for "now"
  const boundary = currentBoundary(Date.now());
  predictedForBoundary = null;
  await preDrawLocal(boundary);
  boundaryFired = boundary;
}

function updateTimerDisplay() {
  const ms = msUntilNextDraw();
  const totalSec = Math.ceil(ms / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  elTimer.textContent = `${mm}:${ss}`;
  elTimer.classList.toggle('urgent', totalSec <= 30);
  const st = $('#liveStatus');
  if (st) st.textContent = state.liveStatus;
}

async function tick() {
  updateTimerDisplay();
  const now = Date.now();
  const next = nextDrawTimestamp(now);
  const msLeft = next - now;

  // Fire PRE-DRAW when we enter the last ~8s before boundary OR just crossed it
  // Original behaviour: spin at the start of the round window
  const boundary = currentBoundary(now);
  const justCrossed = boundary > boundaryFired && now >= boundary;

  // Pre-draw ~3s before the next boundary so tickets can be issued against a locked predict
  if (msLeft <= 3000 && msLeft > 0) {
    const upcoming = next;
    if (!predictedForBoundary || predictedForBoundary.boundary !== upcoming) {
      preDrawLocal(upcoming).catch(e => console.log('Pre-draw error:', e));
    }
  }

  if (justCrossed) {
    boundaryFired = boundary;
    // If we didn't pre-spin, spin now
    if (!predictedForBoundary || predictedForBoundary.boundary !== boundary) {
      await preDrawLocal(boundary);
    }
  }

  // Poll official result every 6s to verify / overlay LIVE
  if (now - (state.lastLiveFetch || 0) > 6000) {
    state.lastLiveFetch = now;
    await verifyLiveAgainstPredict();
  }
}

$('#forceDrawBtn').onclick = () => localSettle().catch(e => console.log('Force draw error:', e));
$('#addFundsBtn').onclick = () => {
  state.balance = +(state.balance + 50).toFixed(2);
  refreshHeader();
  save();
  toast('+€50');
};

const modeBtn = $('#toggleModeBtn');
if (modeBtn) {
  modeBtn.onclick = () => {
    state.mode = state.mode === 'LIVE' ? 'LOCAL' : 'LIVE';
    refreshHeader();
    save();
    toast('Mode: ' + state.mode);
  };
}

renderBetConfig();
refreshDraft();
refreshHeader();
renderTickets();
renderDrawHistory();
updateTimerDisplay();

setInterval(tick, 400);
// boot: show last history + try live verify
tryLiveSettle().then(() => refreshHeader());

if (state.drawHistory[0]) {
  paintWheels(state.drawHistory[0].wheels, false);
  elDrawId.textContent = 'Draw #' + state.drawHistory[0].drawId;
}
