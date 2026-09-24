const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Data files for prediction system
const PREDICTION_DATA_FILE = path.join(__dirname, 'prediction-data.json');
const LIVE_RESULTS_FILE = path.join(__dirname, 'live-results.json');

// Initialize prediction data
function initPredictionData() {
  if (!fs.existsSync(PREDICTION_DATA_FILE)) {
    const initialData = {
      totalPredictions: 0,
      correctPredictions: 0,
      predictionHistory: [],
      patterns: {
        numberFrequency: {},
        symbolFrequency: 0,
        zoneFrequency: { RED: 0, GREEN: 0, BLUE: 0 },
        overUnderFrequency: { Over: 0, Under: 0 }
      },
      lastUpdated: Date.now()
    };
    fs.writeFileSync(PREDICTION_DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

function initLiveResults() {
  if (!fs.existsSync(LIVE_RESULTS_FILE)) {
    fs.writeFileSync(LIVE_RESULTS_FILE, JSON.stringify([], null, 2));
  }
}

// Load prediction data
function loadPredictionData() {
  try {
    return JSON.parse(fs.readFileSync(PREDICTION_DATA_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

// Save prediction data
function savePredictionData(data) {
  data.lastUpdated = Date.now();
  fs.writeFileSync(PREDICTION_DATA_FILE, JSON.stringify(data, null, 2));
}

// Load live results
function loadLiveResults() {
  try {
    return JSON.parse(fs.readFileSync(LIVE_RESULTS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

// Save live results
function saveLiveResults(results) {
  // Keep only last 1000 results
  const trimmed = results.slice(0, 1000);
  fs.writeFileSync(LIVE_RESULTS_FILE, JSON.stringify(trimmed, null, 2));
}

// Smart prediction algorithm based on historical patterns
function generateSmartPrediction() {
  const data = loadPredictionData();
  if (!data || data.totalPredictions < 10) {
    // Not enough data, use random
    return generateRandomPrediction();
  }

  const patterns = data.patterns;
  const totalWheels = data.totalPredictions * 3;
  
  // Calculate probabilities based on historical data
  const symbolProb = patterns.symbolFrequency / totalWheels;
  const zoneProbs = {
    RED: patterns.zoneFrequency.RED / (totalWheels - patterns.symbolFrequency),
    GREEN: patterns.zoneFrequency.GREEN / (totalWheels - patterns.symbolFrequency),
    BLUE: patterns.zoneFrequency.BLUE / (totalWheels - patterns.symbolFrequency)
  };
  const overUnderProbs = {
    Over: patterns.overUnderFrequency.Over / (totalWheels - patterns.symbolFrequency),
    Under: patterns.overUnderFrequency.Under / (totalWheels - patterns.symbolFrequency)
  };

  // Generate weighted prediction
  const wheels = [];
  for (let i = 0; i < 3; i++) {
    const rand = Math.random();
    
    if (rand < symbolProb) {
      wheels.push({
        drawNumber: 25,
        drawPowerSpinOverUnder: 'None',
        drawPowerSpinZone: 'NONE',
        drawPowerSpinSymbol: true
      });
    } else {
      // Select zone based on probability
      const zoneRand = Math.random();
      let zone;
      if (zoneRand < zoneProbs.RED) zone = 'RED';
      else if (zoneRand < zoneProbs.RED + zoneProbs.GREEN) zone = 'GREEN';
      else zone = 'BLUE';
      
      // Select over/under based on probability
      const ouRand = Math.random();
      const overUnder = ouRand < overUnderProbs.Over ? 'Over' : 'Under';
      
      // Select number from zone
      const zoneNumbers = {
        RED: [2, 5, 6, 7, 10, 15, 20, 21],
        GREEN: [3, 4, 12, 13, 17, 18, 19, 23],
        BLUE: [1, 8, 9, 11, 14, 16, 22, 24]
      };
      const number = zoneNumbers[zone][Math.floor(Math.random() * zoneNumbers[zone].length)];
      
      wheels.push({
        drawNumber: number,
        drawPowerSpinOverUnder: overUnder,
        drawPowerSpinZone: zone,
        drawPowerSpinSymbol: false
      });
    }
  }

  return wheels;
}

function generateRandomPrediction() {
  const ZONES = {
    RED: [2, 5, 6, 7, 10, 15, 20, 21],
    GREEN: [3, 4, 12, 13, 17, 18, 19, 23],
    BLUE: [1, 8, 9, 11, 14, 16, 22, 24]
  };

  const ZONE_OF = {};
  for (const [z, nums] of Object.entries(ZONES)) {
    for (const n of nums) ZONE_OF[n] = z;
  }

  const wheels = [];
  for (let i = 0; i < 3; i++) {
    const isSymbol = Math.random() < 3/27; // 3 symbols out of 27 slots
    if (isSymbol) {
      wheels.push({
        drawNumber: 25,
        drawPowerSpinOverUnder: 'None',
        drawPowerSpinZone: 'NONE',
        drawPowerSpinSymbol: true
      });
    } else {
      const number = Math.floor(Math.random() * 24) + 1;
      wheels.push({
        drawNumber: number,
        drawPowerSpinOverUnder: number > 12.5 ? 'Over' : 'Under',
        drawPowerSpinZone: ZONE_OF[number] || 'NONE',
        drawPowerSpinSymbol: false
      });
    }
  }
  return wheels;
}

// Update patterns with new result
function updatePatterns(wheels) {
  const data = loadPredictionData();
  if (!data) return;

  wheels.forEach(wheel => {
    if (wheel.drawPowerSpinSymbol) {
      data.patterns.symbolFrequency++;
    } else {
      const num = wheel.drawNumber;
      data.patterns.numberFrequency[num] = (data.patterns.numberFrequency[num] || 0) + 1;
      data.patterns.zoneFrequency[wheel.drawPowerSpinZone]++;
      data.patterns.overUnderFrequency[wheel.drawPowerSpinOverUnder]++;
    }
  });

  data.totalPredictions += 3;
  savePredictionData(data);
}

// 24/7 Prediction System
let predictionInterval;
let lastPredictionTime = 0;
const PREDICTION_INTERVAL = 4 * 60 * 1000; // Every 4 minutes (matching PowerSpin draw cycle)

function startPredictionSystem() {
  console.log('🎰 Starting 24/7 PowerSpin Prediction System...');
  
  // Run immediately
  runPredictionCycle();
  
  // Schedule regular predictions
  predictionInterval = setInterval(() => {
    runPredictionCycle();
  }, PREDICTION_INTERVAL);
}

function runPredictionCycle() {
  const now = Date.now();
  const drawId = Math.floor(now / 1000);
  
  console.log(`🎯 Generating prediction for draw #${drawId} at ${new Date().toISOString()}`);
  
  // Generate smart prediction
  const prediction = generateSmartPrediction();
  
  // Store prediction
  const data = loadPredictionData();
  if (data) {
    data.predictionHistory.unshift({
      drawId,
      wheels: prediction,
      timestamp: now,
      type: data.totalPredictions >= 10 ? 'SMART' : 'RANDOM'
    });
    
    // Keep only last 100 predictions
    if (data.predictionHistory.length > 100) {
      data.predictionHistory = data.predictionHistory.slice(0, 100);
    }
    
    savePredictionData(data);
  }
  
  lastPredictionTime = now;
  console.log(`✅ Prediction generated for draw #${drawId}`);
}

// API Routes

// Health check endpoint for uptime monitoring
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    lastPrediction: lastPredictionTime ? new Date(lastPredictionTime).toISOString() : null,
    uptime: process.uptime()
  });
});

// Get current prediction
app.get('/api/prediction', (req, res) => {
  const data = loadPredictionData();
  if (!data || !data.predictionHistory.length) {
    return res.json({ prediction: generateRandomPrediction(), type: 'RANDOM' });
  }
  
  const latestPrediction = data.predictionHistory[0];
  res.json({
    drawId: latestPrediction.drawId,
    wheels: latestPrediction.wheels,
    type: latestPrediction.type,
    timestamp: latestPrediction.timestamp
  });
});

// Get prediction statistics
app.get('/api/stats', (req, res) => {
  const data = loadPredictionData();
  if (!data) {
    return res.json({ error: 'No data available' });
  }
  
  const accuracy = data.totalPredictions > 0 
    ? (data.correctPredictions / data.totalPredictions * 100).toFixed(2) 
    : 0;
  
  res.json({
    totalPredictions: data.totalPredictions,
    correctPredictions: data.correctPredictions,
    accuracy: accuracy + '%',
    patterns: data.patterns,
    lastUpdated: data.lastUpdated
  });
});

// Submit live result for learning
app.post('/api/result', (req, res) => {
  const { drawId, wheels } = req.body;
  
  if (!drawId || !wheels || !Array.isArray(wheels)) {
    return res.status(400).json({ error: 'Invalid data' });
  }
  
  // Store live result
  const liveResults = loadLiveResults();
  liveResults.unshift({
    drawId,
    wheels,
    timestamp: Date.now()
  });
  saveLiveResults(liveResults);
  
  // Update patterns with this result
  updatePatterns(wheels);
  
  // Check if our prediction was correct
  const data = loadPredictionData();
  if (data && data.predictionHistory.length > 0) {
    const latestPrediction = data.predictionHistory[0];
    if (latestPrediction.drawId === drawId) {
      const match = wheels.every((w, i) => 
        w.drawPowerSpinSymbol === latestPrediction.wheels[i].drawPowerSpinSymbol &&
        w.drawNumber === latestPrediction.wheels[i].drawNumber
      );
      
      if (match) {
        data.correctPredictions++;
        savePredictionData(data);
      }
    }
  }
  
  res.json({ success: true, message: 'Result recorded and patterns updated' });
});

// Get prediction history
app.get('/api/history', (req, res) => {
  const data = loadPredictionData();
  if (!data) {
    return res.json({ history: [] });
  }
  
  res.json({
    history: data.predictionHistory.slice(0, 20), // Last 20 predictions
    total: data.predictionHistory.length
  });
});

// Initialize and start server
initPredictionData();
initLiveResults();

// Start the prediction system
startPredictionSystem();

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PowerSpin Simulator running on port ${PORT}`);
  console.log(`📊 Prediction system active - generating predictions every 4 minutes`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});