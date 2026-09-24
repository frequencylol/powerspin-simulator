const crypto = require('crypto');

const ZONES = {
  RED: [2, 5, 6, 7, 10, 15, 20, 21],
  GREEN: [3, 4, 12, 13, 17, 18, 19, 23],
  BLUE: [1, 8, 9, 11, 14, 16, 22, 24]
};
const zoneOf = Object.fromEntries(Object.entries(ZONES).flatMap(([zone, numbers]) => numbers.map((number) => [number, zone])));
const OUTCOMES = [...Array(24)].map((_, i) => i + 1).concat([25, 25, 25]);

function normalizeWheel(wheel) {
  const symbol = Boolean(wheel?.drawPowerSpinSymbol) || Number(wheel?.drawNumber) === 25 || Number(wheel?.drawNumber) === 26;
  return symbol ? 25 : Number(wheel?.drawNumber);
}

function flattenHistory(history = []) {
  return history.flatMap((draw) => (draw.wheels || draw.drawPowerSpinWheels || []).map((wheel, wheelIndex) => ({
    drawId: String(draw.drawId ?? draw.drawIdNumber ?? ''),
    timestamp: Number(draw.timestamp || draw.drawTimestamp || 0),
    wheelIndex,
    value: normalizeWheel(wheel)
  }))).filter((item) => OUTCOMES.includes(item.value));
}

function counts(values) {
  return values.reduce((result, value) => { result[value] = (result[value] || 0) + 1; return result; }, {});
}

function seededRandom(seed) {
  let state = crypto.createHash('sha256').update(String(seed)).digest().readUInt32BE(0) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function softmax(scores, temperature = 1) {
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp((score - max) / temperature));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

function historyForWheel(history, wheelIndex) {
  return history.filter((item) => item.wheelIndex === wheelIndex).sort((a, b) => Number(a.drawId) - Number(b.drawId));
}

function scoreEngine(values, engine, rng) {
  const recent = values.slice(-40).map((item) => item.value);
  const all = values.map((item) => item.value);
  const recentCounts = counts(recent);
  const allCounts = counts(all);
  const scores = OUTCOMES.map((value, index) => {
    const base = Math.log(1 / 27);
    const frequency = Math.log((allCounts[value] || 0.5) / Math.max(1, all.length));
    const recentFrequency = Math.log((recentCounts[value] || 0.5) / Math.max(1, recent.length));
    const last = values.at(-1)?.value;
    const sameZone = value !== 25 && last !== 25 && zoneOf[value] === zoneOf[last];
    const overdue = values.slice().reverse().findIndex((item) => item.value === value);
    const lag = overdue < 0 ? 1 : Math.min(overdue + 1, 40) / 40;
    let score = base;
    if (engine === 'BAYESIAN') score += 0.7 * frequency + 0.3 * recentFrequency;
    if (engine === 'TRANSITION') score += (sameZone ? 0.08 : -0.02) + (last === value ? 0.18 : 0);
    if (engine === 'OVERDUE') score += 0.55 * lag - 0.15 * recentFrequency;
    if (engine === 'SYMBOL') score += value === 25 ? 0.18 : -0.01 * (recentCounts[25] || 0);
    score += (rng() - 0.5) * 0.035;
    return score;
  });
  return softmax(scores, 0.8);
}

function chooseFromProbabilities(probabilities, rng) {
  let cursor = rng();
  for (let i = 0; i < probabilities.length; i++) {
    cursor -= probabilities[i];
    if (cursor <= 0) return OUTCOMES[i];
  }
  return OUTCOMES.at(-1);
}

function buildResearchPrediction(history = [], drawTimestamp = Date.now()) {
  const flat = flattenHistory(history);
  const engines = ['BAYESIAN', 'TRANSITION', 'OVERDUE', 'SYMBOL'];
  const rng = seededRandom(`${drawTimestamp}:powerspin-research-v1`);
  const wheels = [0, 1, 2].map((wheelIndex) => {
    const values = historyForWheel(flat, wheelIndex);
    const engineProbabilities = engines.map((engine) => scoreEngine(values, engine, rng));
    const probabilities = OUTCOMES.map((_, index) => engineProbabilities.reduce((sum, distribution) => sum + distribution[index], 0) / engines.length);
    const value = chooseFromProbabilities(probabilities, rng);
    const confidence = Math.max(...probabilities);
    const symbol = value === 25;
    return {
      drawNumber: symbol ? 25 : value,
      drawPowerSpinOverUnder: symbol ? 'None' : value > 12 ? 'Over' : 'Under',
      drawPowerSpinZone: symbol ? 'NONE' : zoneOf[value],
      drawPowerSpinSymbol: symbol,
      confidence: Number(confidence.toFixed(4)),
      engine: 'ENSEMBLE_RESEARCH',
      wheelIndex
    };
  });
  return {
    version: 'research-v1',
    measure: '27 equal physical slots: 1-24 plus 3 SPIN slots',
    generatedAt: new Date(drawTimestamp).toISOString(),
    drawTimestamp,
    engines,
    wheels
  };
}

module.exports = { buildResearchPrediction, flattenHistory, normalizeWheel };
