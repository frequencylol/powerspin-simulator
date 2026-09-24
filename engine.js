/**
 * POWERSPIN 1:1 Engine
 * - Same 27-slot wheel model as OPAP (24 numbers + 3 SPIN)
 * - Official zones + payouts
 * - Live mirror: when official result is available, use THAT instead of local RNG
 */

const ZONES = {
  RED:   [2, 5, 6, 7, 10, 15, 20, 21],
  GREEN: [3, 4, 12, 13, 17, 18, 19, 23],
  BLUE:  [1, 8, 9, 11, 14, 16, 22, 24]
};

const ZONE_OF = {};
for (const [z, nums] of Object.entries(ZONES)) {
  for (const n of nums) ZONE_OF[n] = z;
}

const PAYOUTS = {
  NUMBER_1: 24, NUMBER_2: 12, NUMBER_3: 8, NUMBER_4: 6,
  NUMBER_6: 4, NUMBER_8: 3, NUMBER_12: 2,
  SYMBOL: 8, ZONE: 3, OVER_UNDER: 2
};

const EXTRA_PAYOUTS = {
  NO_SYMBOL_ANY: 1.2,
  AT_LEAST_ONE_SYMBOL: 3,
  SAME_NUMBER_2: 9,
  SAME_NUMBER_3: 700
};

const WHEEL = (() => {
  const s = [];
  for (let i = 1; i <= 24; i++) s.push({ type: 'NUMBER', value: i });
  for (let i = 0; i < 3; i++) s.push({ type: 'SYMBOL', value: 'SPIN' });
  return s;
})();

function spinOnce() {
  const slot = WHEEL[Math.floor(Math.random() * WHEEL.length)];
  if (slot.type === 'SYMBOL') {
    return {
      drawNumber: 25,
      drawPowerSpinOverUnder: 'None',
      drawPowerSpinZone: 'NONE',
      drawPowerSpinSymbol: true
    };
  }
  const n = slot.value;
  return {
    drawNumber: n,
    drawPowerSpinOverUnder: n > 12.5 ? 'Over' : 'Under',
    drawPowerSpinZone: ZONE_OF[n] || 'NONE',
    drawPowerSpinSymbol: false
  };
}

function drawFull() {
  return [spinOnce(), spinOnce(), spinOnce()];
}

/** Parse official API wheel list into our shape */
function wheelsFromOfficial(listWinningNumbers) {
  if (!Array.isArray(listWinningNumbers) || !listWinningNumbers.length) return null;
  return listWinningNumbers.slice(0, 3).map(w => {
    const side = w.sidebets || {};
    const isSymbol = !!side.symbol || (w.list && w.list[0] === 25);
    const n = isSymbol ? 25 : (w.list && w.list[0]);
    let zone = 'NONE';
    if (side.color === 'Red') zone = 'RED';
    else if (side.color === 'Green') zone = 'GREEN';
    else if (side.color === 'Blue') zone = 'BLUE';
    else if (!isSymbol && n) zone = ZONE_OF[n] || 'NONE';
    let ou = side.powerSpinUnderOver || 'None';
    if (!isSymbol && n && (!ou || ou === 'None')) ou = n > 12.5 ? 'Over' : 'Under';
    return {
      drawNumber: n,
      drawPowerSpinOverUnder: isSymbol ? 'None' : ou,
      drawPowerSpinZone: isSymbol ? 'NONE' : zone,
      drawPowerSpinSymbol: isSymbol
    };
  });
}

/** Parse the stores.allwyn.gr /o/opap/game/results/1110 history entry */
function wheelsFromStoresHistory(entry) {
  if (!entry || !entry.drawPowerSpinWheels) return null;
  return entry.drawPowerSpinWheels.map(w => ({
    drawNumber: w.drawNumber,
    drawPowerSpinOverUnder: w.drawPowerSpinOverUnder || 'None',
    drawPowerSpinZone: w.drawPowerSpinZone || 'NONE',
    drawPowerSpinSymbol: !!w.drawPowerSpinSymbol
  }));
}

function evaluateBet(bet, wheels) {
  const stake = Number(bet.stake) || 0;
  if (stake <= 0) return { win: false, payout: 0, detail: 'invalid', mult: 0 };
  const main = wheels[0];

  switch (bet.type) {
    case 'NUMBER':
    case 'NUMBERS': {
      const nums = (bet.numbers || [bet.number]).map(Number).filter(n => n >= 1 && n <= 24);
      if (!nums.length) return { win: false, payout: 0, detail: 'no numbers', mult: 0 };
      if (main.drawPowerSpinSymbol) return { win: false, payout: 0, detail: 'symbol', mult: 0 };
      if (!nums.includes(main.drawNumber)) return { win: false, payout: 0, detail: 'miss', mult: 0 };
      const mult = PAYOUTS['NUMBER_' + nums.length] || (24 / nums.length);
      return { win: true, payout: +(stake * mult).toFixed(2), mult, detail: 'hit ' + main.drawNumber };
    }
    case 'SYMBOL': {
      if (main.drawPowerSpinSymbol)
        return { win: true, payout: +(stake * PAYOUTS.SYMBOL).toFixed(2), mult: 8, detail: 'symbol' };
      return { win: false, payout: 0, detail: 'no symbol', mult: 0 };
    }
    case 'ZONE': {
      if (main.drawPowerSpinSymbol) return { win: false, payout: 0, detail: 'symbol', mult: 0 };
      if (main.drawPowerSpinZone === bet.zone)
        return { win: true, payout: +(stake * PAYOUTS.ZONE).toFixed(2), mult: 3, detail: bet.zone };
      return { win: false, payout: 0, detail: 'wrong zone', mult: 0 };
    }
    case 'OVER': {
      if (main.drawPowerSpinSymbol) return { win: false, payout: 0, detail: 'symbol', mult: 0 };
      if (main.drawPowerSpinOverUnder === 'Over')
        return { win: true, payout: +(stake * 2).toFixed(2), mult: 2, detail: 'Over' };
      return { win: false, payout: 0, detail: 'Under', mult: 0 };
    }
    case 'UNDER': {
      if (main.drawPowerSpinSymbol) return { win: false, payout: 0, detail: 'symbol', mult: 0 };
      if (main.drawPowerSpinOverUnder === 'Under')
        return { win: true, payout: +(stake * 2).toFixed(2), mult: 2, detail: 'Under' };
      return { win: false, payout: 0, detail: 'Over', mult: 0 };
    }
    case 'AT_LEAST_ONE_SYMBOL': {
      const c = wheels.filter(w => w.drawPowerSpinSymbol).length;
      if (c >= 1) return { win: true, payout: +(stake * 3).toFixed(2), mult: 3, detail: c + ' symbols' };
      return { win: false, payout: 0, detail: 'zero', mult: 0 };
    }
    case 'NO_SYMBOL': {
      const c = wheels.filter(w => w.drawPowerSpinSymbol).length;
      if (c === 0) return { win: true, payout: +(stake * 1.2).toFixed(2), mult: 1.2, detail: 'clean' };
      return { win: false, payout: 0, detail: c + ' symbols', mult: 0 };
    }
    case 'SAME_NUMBER_2': {
      const nums = wheels.filter(w => !w.drawPowerSpinSymbol).map(w => w.drawNumber);
      const counts = {};
      for (const n of nums) counts[n] = (counts[n] || 0) + 1;
      if (Object.values(counts).some(c => c >= 2))
        return { win: true, payout: +(stake * 9).toFixed(2), mult: 9, detail: 'pair' };
      return { win: false, payout: 0, detail: 'no pair', mult: 0 };
    }
    case 'SAME_NUMBER_3': {
      const nums = wheels.filter(w => !w.drawPowerSpinSymbol).map(w => w.drawNumber);
      if (nums.length === 3 && nums[0] === nums[1] && nums[1] === nums[2])
        return { win: true, payout: +(stake * 700).toFixed(2), mult: 700, detail: 'triple' };
      return { win: false, payout: 0, detail: 'no triple', mult: 0 };
    }
    default:
      return { win: false, payout: 0, detail: 'unknown', mult: 0 };
  }
}

function evaluateTicket(bets, wheels) {
  let totalStake = 0, totalPayout = 0;
  const results = [];
  for (const bet of bets) {
    totalStake += Number(bet.stake) || 0;
    const r = evaluateBet(bet, wheels);
    totalPayout += r.payout;
    results.push({ bet, ...r });
  }
  return {
    totalStake: +totalStake.toFixed(2),
    totalPayout: +totalPayout.toFixed(2),
    net: +(totalPayout - totalStake).toFixed(2),
    results
  };
}

const DRAW_INTERVAL_MS = 4 * 60 * 1000;

function nextDrawTimestamp(fromMs = Date.now()) {
  return Math.ceil((fromMs + 1) / DRAW_INTERVAL_MS) * DRAW_INTERVAL_MS;
}

function msUntilNextDraw(fromMs = Date.now()) {
  return Math.max(0, nextDrawTimestamp(fromMs) - fromMs);
}

function currentBoundary(fromMs = Date.now()) {
  return Math.floor(fromMs / DRAW_INTERVAL_MS) * DRAW_INTERVAL_MS;
}

/** Live fetch — tries multiple public endpoints from the browser (CORS may allow stores) */
async function fetchLiveResult() {
  const urls = [
    'https://stores.allwyn.gr/o/opap/game/results/1110',
    'https://api.opap.gr/draws/v3.0/1110/last-result-and-active',
    'https://numericsapi.allwyn.gr/draws/v3.0/1110/last-result-and-active'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json, */*' },
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store'
      });
      if (!res.ok) continue;
      const data = await res.json();
      // stores.allwyn shape
      if (data.history && data.history[0]) {
        const h = data.history[0];
        const wheels = wheelsFromStoresHistory(h);
        if (wheels) {
          return {
            source: 'stores',
            drawId: h.drawId,
            ts: h.drawTimestamp,
            wheels,
            active: data.active || null,
            raw: data
          };
        }
      }
      // api.opap shape
      if (data.last || data.drawId || data.winningNumbers || data.listWinningNumbers) {
        const last = data.last || data;
        const list = last.listWinningNumbers || data.listWinningNumbers;
        const wheels = wheelsFromOfficial(list);
        if (wheels) {
          return {
            source: 'opap-api',
            drawId: last.drawId || data.drawId,
            ts: last.drawTime || last.drawTimestamp || Date.now(),
            wheels,
            active: data.active || null,
            raw: data
          };
        }
      }
    } catch (e) {
      // CORS / network — try next
    }
  }
  return null;
}
