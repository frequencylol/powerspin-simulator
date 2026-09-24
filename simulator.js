#!/usr/bin/env node
/**
 * POWERSPIN 1:1 Simulator (CLI)
 * Real 4-minute countdown, real payouts, ticket system ("Ekdothike Deltio")
 * Usage: node simulator.js
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const {
  ZONES, PAYOUTS, drawFull, evaluateTicket,
  nextDrawTimestamp, secondsUntilNextDraw
} = require('./powerspin-engine');

const DATA_FILE = path.join(__dirname, 'player-data.json');
const HISTORY_FILE = path.join(__dirname, 'history.json');

// ─── State ───────────────────────────────────────────────────────────────────
let player = {
  balance: 100.00,
  tickets: [],          // pending + settled
  nextTicketId: 1,
  stats: { wins: 0, losses: 0, totalStaked: 0, totalWon: 0 }
};

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      player = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (_) {}
}
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(player, null, 2));
}
function appendHistory(entry) {
  let hist = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) hist = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (_) {}
  hist.unshift(entry);
  if (hist.length > 500) hist = hist.slice(0, 500);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(hist, null, 2));
}

load();

// ─── Terminal helpers ────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
  bgPurple: '\x1b[45m', bgGreen: '\x1b[42m', bgRed: '\x1b[41m'
};

function clear() { process.stdout.write('\x1b[2J\x1b[0f'); }
function zoneColor(z) {
  if (z === 'RED') return c.red;
  if (z === 'GREEN') return c.green;
  if (z === 'BLUE') return c.blue;
  return c.dim;
}

function formatWheel(w) {
  if (w.drawPowerSpinSymbol) return `${c.magenta}★ SPIN ★${c.reset}`;
  const col = zoneColor(w.drawPowerSpinZone);
  return `${col}${String(w.drawNumber).padStart(2)}${c.reset} ${col}[${w.drawPowerSpinZone}]${c.reset} ${w.drawPowerSpinOverUnder}`;
}

function printHeader() {
  const secs = secondsUntilNextDraw();
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  console.log(`${c.bgPurple}${c.white}${c.bold}  POWERSPIN 1:1 SIMULATOR  ${c.reset}`);
  console.log(`${c.cyan}Balance: ${c.yellow}€${player.balance.toFixed(2)}${c.reset}  |  Next draw in ${c.bold}${mm}:${ss}${c.reset}`);
  console.log(`${c.dim}W/L: ${player.stats.wins}/${player.stats.losses}  Staked: €${player.stats.totalStaked.toFixed(2)}  Won: €${player.stats.totalWon.toFixed(2)}${c.reset}`);
  console.log('─'.repeat(50));
}

// ─── Betting UI ──────────────────────────────────────────────────────────────
async function buildTicket() {
  const bets = [];
  console.log(`\n${c.bold}New Δελτίο (Ticket)${c.reset}`);
  console.log('Bet types: number | numbers | symbol | zone | over | under | nosymbol | onesymbol | pair | triple');
  console.log('Type "done" when finished, "cancel" to abort.\n');

  while (true) {
    const typeRaw = (await ask('Type > ')).trim().toLowerCase();
    if (typeRaw === 'done') break;
    if (typeRaw === 'cancel') return null;

    let bet = null;
    try {
      if (typeRaw === 'number' || typeRaw === 'n') {
        const n = Number(await ask('Number (1-24): '));
        const stake = Number(await ask('Stake €: '));
        if (n < 1 || n > 24 || stake <= 0) throw new Error('bad input');
        bet = { type: 'NUMBER', numbers: [n], stake };
      } else if (typeRaw === 'numbers' || typeRaw === 'ns') {
        const raw = await ask('Numbers comma-separated (e.g. 3,7,12): ');
        const nums = raw.split(/[,\s]+/).map(Number).filter(n => n >= 1 && n <= 24);
        if (![1,2,3,4,6,8,12].includes(nums.length)) {
          console.log('Allowed counts: 1,2,3,4,6,8,12');
          continue;
        }
        const stake = Number(await ask('Stake €: '));
        if (stake <= 0) throw new Error('bad stake');
        bet = { type: 'NUMBERS', numbers: nums, stake };
      } else if (typeRaw === 'symbol' || typeRaw === 's') {
        const stake = Number(await ask('Stake €: '));
        bet = { type: 'SYMBOL', stake };
      } else if (typeRaw === 'zone' || typeRaw === 'z') {
        const z = (await ask('Zone (RED/GREEN/BLUE): ')).trim().toUpperCase();
        if (!['RED','GREEN','BLUE'].includes(z)) throw new Error('bad zone');
        const stake = Number(await ask('Stake €: '));
        bet = { type: 'ZONE', zone: z, stake };
      } else if (typeRaw === 'over' || typeRaw === 'o') {
        const stake = Number(await ask('Stake €: '));
        bet = { type: 'OVER', stake };
      } else if (typeRaw === 'under' || typeRaw === 'u') {
        const stake = Number(await ask('Stake €: '));
        bet = { type: 'UNDER', stake };
      } else if (typeRaw === 'nosymbol') {
        const stake = Number(await ask('Stake €: '));
        bet = { type: 'NO_SYMBOL', stake };
      } else if (typeRaw === 'onesymbol') {
        const stake = Number(await ask('Stake €: '));
        bet = { type: 'AT_LEAST_ONE_SYMBOL', stake };
      } else if (typeRaw === 'pair') {
        const stake = Number(await ask('Stake €: '));
        bet = { type: 'SAME_NUMBER_2', stake };
      } else if (typeRaw === 'triple') {
        const stake = Number(await ask('Stake €: '));
        bet = { type: 'SAME_NUMBER_3', stake };
      } else {
        console.log('Unknown type.');
        continue;
      }

      if (!bet || bet.stake <= 0) {
        console.log('Invalid stake.');
        continue;
      }
      bets.push(bet);
      console.log(`${c.green}+ added${c.reset} ${JSON.stringify(bet)}`);
    } catch (e) {
      console.log(`${c.red}Invalid input.${c.reset}`);
    }
  }

  if (!bets.length) return null;

  const totalStake = bets.reduce((s, b) => s + b.stake, 0);
  if (totalStake > player.balance) {
    console.log(`${c.red}Insufficient balance (need €${totalStake.toFixed(2)}).${c.reset}`);
    return null;
  }

  player.balance = +(player.balance - totalStake).toFixed(2);
  const ticket = {
    id: player.nextTicketId++,
    bets,
    totalStake: +totalStake.toFixed(2),
    status: 'PENDING',
    createdAt: Date.now(),
    drawId: null,
    result: null
  };
  player.tickets.unshift(ticket);
  player.stats.totalStaked = +(player.stats.totalStaked + totalStake).toFixed(2);
  save();

  console.log(`\n${c.bgGreen}${c.white}${c.bold}  Εκδόθηκε Δελτίο  ${c.reset}`);
  console.log(`${c.green}Δελτίο #${ticket.id}${c.reset}  stake €${ticket.totalStake.toFixed(2)}`);
  console.log(`Waiting for next draw...\n`);
  return ticket;
}

// ─── Draw cycle ──────────────────────────────────────────────────────────────
let lastSettledTs = 0;

function settlePending(wheels, drawId, ts) {
  const pending = player.tickets.filter(t => t.status === 'PENDING');
  if (!pending.length) return;

  console.log(`\n${c.bold}${c.magenta}═══ DRAW ${drawId} ═══${c.reset}`);
  console.log(`Wheel 1: ${formatWheel(wheels[0])}`);
  console.log(`Wheel 2: ${formatWheel(wheels[1])}`);
  console.log(`Wheel 3: ${formatWheel(wheels[2])}`);
  console.log('');

  for (const t of pending) {
    const evaled = evaluateTicket(t.bets, wheels);
    t.status = evaled.totalPayout > 0 ? 'WIN' : 'LOSE';
    t.drawId = drawId;
    t.result = { wheels, evaled, settledAt: ts };
    player.balance = +(player.balance + evaled.totalPayout).toFixed(2);
    player.stats.totalWon = +(player.stats.totalWon + evaled.totalPayout).toFixed(2);
    if (evaled.totalPayout > 0) {
      player.stats.wins++;
      console.log(`${c.green}Δελτίο #${t.id} WIN +€${evaled.totalPayout.toFixed(2)}${c.reset} (net ${evaled.net >= 0 ? '+' : ''}€${evaled.net.toFixed(2)})`);
    } else {
      player.stats.losses++;
      console.log(`${c.red}Δελτίο #${t.id} LOSE -€${t.totalStake.toFixed(2)}${c.reset}`);
    }
    for (const r of evaled.results) {
      const mark = r.win ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
      console.log(`  ${mark} ${r.bet.type} stake€${r.bet.stake} → ${r.detail} ${r.win ? `x${r.mult} = €${r.payout}` : ''}`);
    }
    appendHistory({
      ticketId: t.id,
      drawId,
      status: t.status,
      stake: t.totalStake,
      payout: evaled.totalPayout,
      net: evaled.net,
      wheels,
      ts
    });
  }
  save();
  console.log(`Balance now: €${player.balance.toFixed(2)}\n`);
}

function runDrawIfDue() {
  const now = Date.now();
  const next = nextDrawTimestamp(now);
  // Fire when we cross a boundary
  if (next - now > 239000) { // just after a boundary
    // already handled
  }
  // Simpler: check every second if we hit a 4-min boundary that we haven't settled
  const currentBoundary = Math.floor(now / 240000) * 240000;
  if (currentBoundary > lastSettledTs && currentBoundary <= now) {
    lastSettledTs = currentBoundary;
    const wheels = drawFull();
    const drawId = Math.floor(currentBoundary / 1000); // synthetic id
    settlePending(wheels, drawId, currentBoundary);
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────
async function showTicket(id) {
  const t = player.tickets.find(x => x.id === Number(id));
  if (!t) {
    console.log('Ticket not found.');
    return;
  }
  console.log(`\n${c.bold}Δελτίο #${t.id}${c.reset}  [${t.status}]`);
  console.log(`Stake: €${t.totalStake.toFixed(2)}  Created: ${new Date(t.createdAt).toLocaleString()}`);
  for (const b of t.bets) {
    console.log(`  • ${JSON.stringify(b)}`);
  }
  if (t.result) {
    console.log(`Draw #${t.drawId}`);
    t.result.wheels.forEach((w, i) => console.log(`  W${i + 1}: ${formatWheel(w)}`));
    console.log(`Payout: €${t.result.evaled.totalPayout.toFixed(2)}  Net: €${t.result.evaled.net.toFixed(2)}`);
  } else {
    console.log(`${c.yellow}Pending next draw...${c.reset}`);
  }
  console.log('');
}

async function showHistory(limit = 10) {
  let hist = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) hist = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (_) {}
  console.log(`\n${c.bold}Last ${limit} results${c.reset}`);
  for (const h of hist.slice(0, limit)) {
    const col = h.status === 'WIN' ? c.green : c.red;
    console.log(`${col}#${h.ticketId}${c.reset} draw ${h.drawId}  ${h.status}  stake€${h.stake} → €${h.payout} (net ${h.net})`);
  }
  console.log('');
}

function printHelp() {
  console.log(`
${c.bold}Commands${c.reset}
  bet / b          Create new ticket (Δελτίο)
  tickets / t      List recent tickets
  check <id>       Check specific Δελτίο
  history / h      Win/lose history
  balance / bal    Show balance
  add <amount>     Add funds (demo)
  force            Force immediate draw (test)
  help             This help
  quit / exit      Exit
`);
}

// ─── Main loop ───────────────────────────────────────────────────────────────
async function main() {
  clear();
  printHeader();
  printHelp();

  // Live countdown ticker
  setInterval(() => {
    runDrawIfDue();
  }, 1000);

  // Soft status line every 15s
  setInterval(() => {
    const secs = secondsUntilNextDraw();
    if (secs % 15 === 0 && secs > 0) {
      const mm = String(Math.floor(secs / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');
      process.stdout.write(`\r${c.dim}⏱ next draw ${mm}:${ss} | €${player.balance.toFixed(2)}   ${c.reset}`);
    }
  }, 1000);

  while (true) {
    const line = (await ask(`${c.cyan}powerspin>${c.reset} `)).trim();
    if (!line) continue;
    const [cmd, ...args] = line.split(/\s+/);
    const c0 = cmd.toLowerCase();

    if (c0 === 'quit' || c0 === 'exit' || c0 === 'q') {
      save();
      console.log('Saved. Γεια.');
      process.exit(0);
    } else if (c0 === 'help' || c0 === '?') {
      printHelp();
    } else if (c0 === 'bet' || c0 === 'b') {
      await buildTicket();
    } else if (c0 === 'tickets' || c0 === 't') {
      console.log(`\n${c.bold}Recent tickets${c.reset}`);
      for (const t of player.tickets.slice(0, 15)) {
        const col = t.status === 'WIN' ? c.green : t.status === 'LOSE' ? c.red : c.yellow;
        console.log(`${col}#${t.id}${c.reset} ${t.status.padEnd(7)} €${t.totalStake.toFixed(2)}  ${t.drawId ? 'draw ' + t.drawId : 'pending'}`);
      }
      console.log('');
    } else if (c0 === 'check') {
      await showTicket(args[0]);
    } else if (c0 === 'history' || c0 === 'h') {
      await showHistory(Number(args[0]) || 15);
    } else if (c0 === 'balance' || c0 === 'bal') {
      printHeader();
    } else if (c0 === 'add') {
      const amt = Number(args[0]);
      if (amt > 0) {
        player.balance = +(player.balance + amt).toFixed(2);
        save();
        console.log(`+€${amt.toFixed(2)} → €${player.balance.toFixed(2)}`);
      }
    } else if (c0 === 'force') {
      // Immediate test draw
      lastSettledTs = 0;
      const wheels = drawFull();
      const drawId = Math.floor(Date.now() / 1000);
      settlePending(wheels, drawId, Date.now());
      lastSettledTs = Date.now();
    } else {
      console.log('Unknown. Type help.');
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
