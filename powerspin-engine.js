/**
 * POWERSPIN 1:1 Engine (Allwyn / OPAP)
 * Wheel: 24 numbers (1-24) + 3 identical SPIN symbols = 27 equal slots
 * Real payout table + zone mapping from official sources
 */

const crypto = require('crypto');

const ZONES = {
  RED:   [2, 5, 6, 7, 10, 15, 20, 21],
  GREEN: [3, 4, 12, 13, 17, 18, 19, 23],
  BLUE:  [1, 8, 9, 11, 14, 16, 22, 24]
};

const ZONE_OF = {};
for (const [z, nums] of Object.entries(ZONES)) {
  for (const n of nums) ZONE_OF[n] = z;
}

// Official single-wheel payouts (x stake)
const PAYOUTS = {
  NUMBER_1: 24,
  NUMBER_2: 12,
  NUMBER_3: 8,
  NUMBER_4: 6,
  NUMBER_6: 4,
  NUMBER_8: 3,
  NUMBER_12: 2,
  SYMBOL: 8,
  ZONE: 3,
  OVER_UNDER: 2
};

// Extra markets (single draw)
const EXTRA_PAYOUTS = {
  ANY_WHEEL_NUMBER: 8,          // number on any of the 3 wheels (simplified for single)
  NO_SYMBOL_ANY: 1.2,
  AT_LEAST_ONE_SYMBOL: 3,
  SAME_NUMBER_2: 9,
  SAME_NUMBER_3: 700
};

function buildWheel() {
  // 27 slots: numbers 1-24 + 3x SYMBOL
  const slots = [];
  for (let i = 1; i <= 24; i++) slots.push({ type: 'NUMBER', value: i });
  for (let i = 0; i < 3; i++) slots.push({ type: 'SYMBOL', value: 'SPIN' });
  return slots;
}

const WHEEL = buildWheel();

function unbiasedSlotIndex() {
  return crypto.randomInt(0, WHEEL.length);
}

function spinOnce() {
  const idx = unbiasedSlotIndex();
  const slot = WHEEL[idx];
  if (slot.type === 'SYMBOL') {
    return {
      drawNumber: 26, // official API represents the SPIN symbol as 26
      drawPowerSpinOverUnder: 'None',
      drawPowerSpinZone: 'NONE',
      drawPowerSpinSymbol: true,
      raw: slot
    };
  }
  const n = slot.value;
  const zone = ZONE_OF[n] || 'NONE';
  const ou = n > 12.5 ? 'Over' : 'Under';
  return {
    drawNumber: n,
    drawPowerSpinOverUnder: ou,
    drawPowerSpinZone: zone,
    drawPowerSpinSymbol: false,
    raw: slot
  };
}

/** Real PowerSpin draws 3 independent wheels */
function drawFull() {
  return [spinOnce(), spinOnce(), spinOnce()];
}

/**
 * Evaluate a single bet against the 3-wheel result
 * Bet shape examples:
 *  { type: 'NUMBER', numbers: [7], stake: 1 }
 *  { type: 'ZONE', zone: 'RED', stake: 2 }
 *  { type: 'SYMBOL', stake: 1 }
 *  { type: 'OVER', stake: 1 }
 *  { type: 'UNDER', stake: 1 }
 *  { type: 'NUMBERS', numbers: [1,5,12], stake: 1 }  // 3-ada etc
 */
function evaluateBet(bet, wheels) {
  const stake = Number(bet.stake) || 0;
  if (stake <= 0) return { win: false, payout: 0, detail: 'invalid stake' };

  // For classic single-column bets we check the FIRST wheel (main result)
  // Multi-wheel / combo markets can be extended later
  const main = wheels[0];

  switch (bet.type) {
    case 'NUMBER':
    case 'NUMBERS': {
      const nums = (bet.numbers || [bet.number]).map(Number).filter(n => n >= 1 && n <= 24);
      if (!nums.length) return { win: false, payout: 0, detail: 'no numbers' };
      if (main.drawPowerSpinSymbol) return { win: false, payout: 0, detail: 'symbol landed' };
      const hit = nums.includes(main.drawNumber);
      if (!hit) return { win: false, payout: 0, detail: 'miss' };
      const key = `NUMBER_${nums.length}`;
      const mult = PAYOUTS[key] || (24 / nums.length);
      return { win: true, payout: +(stake * mult).toFixed(2), mult, detail: `hit ${main.drawNumber}` };
    }
    case 'SYMBOL': {
      if (main.drawPowerSpinSymbol) {
        return { win: true, payout: +(stake * PAYOUTS.SYMBOL).toFixed(2), mult: PAYOUTS.SYMBOL, detail: 'symbol' };
      }
      return { win: false, payout: 0, detail: 'no symbol' };
    }
    case 'ZONE': {
      if (main.drawPowerSpinSymbol) return { win: false, payout: 0, detail: 'symbol' };
      if (main.drawPowerSpinZone === bet.zone) {
        return { win: true, payout: +(stake * PAYOUTS.ZONE).toFixed(2), mult: PAYOUTS.ZONE, detail: bet.zone };
      }
      return { win: false, payout: 0, detail: 'wrong zone' };
    }
    case 'OVER': {
      if (main.drawPowerSpinSymbol) return { win: false, payout: 0, detail: 'symbol' };
      if (main.drawPowerSpinOverUnder === 'Over') {
        return { win: true, payout: +(stake * PAYOUTS.OVER_UNDER).toFixed(2), mult: 2, detail: 'Over' };
      }
      return { win: false, payout: 0, detail: 'Under' };
    }
    case 'UNDER': {
      if (main.drawPowerSpinSymbol) return { win: false, payout: 0, detail: 'symbol' };
      if (main.drawPowerSpinOverUnder === 'Under') {
        return { win: true, payout: +(stake * PAYOUTS.OVER_UNDER).toFixed(2), mult: 2, detail: 'Under' };
      }
      return { win: false, payout: 0, detail: 'Over' };
    }
    // Extra markets across 3 wheels
    case 'AT_LEAST_ONE_SYMBOL': {
      const count = wheels.filter(w => w.drawPowerSpinSymbol).length;
      if (count >= 1) {
        return { win: true, payout: +(stake * EXTRA_PAYOUTS.AT_LEAST_ONE_SYMBOL).toFixed(2), mult: 3, detail: `${count} symbols` };
      }
      return { win: false, payout: 0, detail: 'zero symbols' };
    }
    case 'NO_SYMBOL': {
      const count = wheels.filter(w => w.drawPowerSpinSymbol).length;
      if (count === 0) {
        return { win: true, payout: +(stake * EXTRA_PAYOUTS.NO_SYMBOL_ANY).toFixed(2), mult: 1.2, detail: 'clean' };
      }
      return { win: false, payout: 0, detail: `${count} symbols` };
    }
    case 'SAME_NUMBER_2': {
      const nums = wheels.filter(w => !w.drawPowerSpinSymbol).map(w => w.drawNumber);
      const counts = {};
      for (const n of nums) counts[n] = (counts[n] || 0) + 1;
      const hasPair = Object.values(counts).some(c => c >= 2);
      if (hasPair) {
        return { win: true, payout: +(stake * EXTRA_PAYOUTS.SAME_NUMBER_2).toFixed(2), mult: 9, detail: 'pair' };
      }
      return { win: false, payout: 0, detail: 'no pair' };
    }
    case 'SAME_NUMBER_3': {
      const nums = wheels.filter(w => !w.drawPowerSpinSymbol).map(w => w.drawNumber);
      if (nums.length === 3 && nums[0] === nums[1] && nums[1] === nums[2]) {
        return { win: true, payout: +(stake * EXTRA_PAYOUTS.SAME_NUMBER_3).toFixed(2), mult: 700, detail: 'triple' };
      }
      return { win: false, payout: 0, detail: 'no triple' };
    }
    default:
      return { win: false, payout: 0, detail: 'unknown bet type' };
  }
}

function evaluateTicket(bets, wheels) {
  let totalStake = 0;
  let totalPayout = 0;
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

// Real timing: draws every 4 minutes (240s). Sync to wall clock.
function nextDrawTimestamp(fromMs = Date.now()) {
  const interval = 4 * 60 * 1000; // 240000 ms
  const next = Math.ceil((fromMs + 1) / interval) * interval;
  return next;
}

function secondsUntilNextDraw(fromMs = Date.now()) {
  return Math.max(0, Math.ceil((nextDrawTimestamp(fromMs) - fromMs) / 1000));
}

module.exports = {
  ZONES,
  ZONE_OF,
  PAYOUTS,
  EXTRA_PAYOUTS,
  WHEEL,
  spinOnce,
  drawFull,
  evaluateBet,
  evaluateTicket,
  nextDrawTimestamp,
  secondsUntilNextDraw
};
