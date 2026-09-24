const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// Vercel function filesystems are read-only outside /tmp. Keep local development
// data beside the app, but use the writable temporary directory in production.
const DATA_DIRECTORY = process.env.VERCEL ? '/tmp/powerspin-simulator' : __dirname;
const PREDICTION_DATA_FILE = path.join(DATA_DIRECTORY, 'prediction-data.json');
const LIVE_RESULTS_FILE = path.join(DATA_DIRECTORY, 'live-results.json');

// Initialize prediction data
function initPredictionData() {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
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
  // PowerSpin wheels are independent 27-slot draws. Historical outcomes do
  // not change the next RNG state, so never weight this estimate by history.
  return generateRandomPrediction();

  /*
  const data = loadPredictionData();
  if (!data || data.totalPredictions < 10) return generateRandomPrediction();
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
        drawNumber: 26,
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
  */
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
    const slot = crypto.randomInt(0, 27);
    const isSymbol = slot >= 24; // 24 numbers + 3 identical symbol slots
    if (isSymbol) {
      wheels.push({
        drawNumber: 26,
        drawPowerSpinOverUnder: 'None',
        drawPowerSpinZone: 'NONE',
        drawPowerSpinSymbol: true
      });
    } else {
      const number = slot + 1;
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

// Simple HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve static files
  if (pathname === '/' || pathname === '/index.html') {
    serveStaticFile(res, 'index.html', 'text/html');
  } else if (pathname === '/style.css') {
    serveStaticFile(res, 'style.css', 'text/css');
  } else if (pathname === '/app.js') {
    serveStaticFile(res, 'app.js', 'application/javascript');
  } else if (pathname === '/engine.js') {
    serveStaticFile(res, 'engine.js', 'application/javascript');
  } else if (pathname === '/powerspin-engine.js') {
    serveStaticFile(res, 'powerspin-engine.js', 'application/javascript');
  } 
  // API Routes
  else if (pathname === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Health-Check': 'ok'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'powerspin-simulator',
      timestamp: new Date().toISOString(),
      lastPrediction: lastPredictionTime ? new Date(lastPredictionTime).toISOString() : null,
      uptime: process.uptime(),
      runtime: process.env.VERCEL ? 'vercel-serverless' : 'node'
    }));
  } else if (pathname === '/api/prediction' && req.method === 'GET') {
    // Generate a fresh independent estimate. Do not reuse history: that would
    // make the UI appear to predict an RNG sequence it cannot observe.
    const timestamp = Date.now();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      drawId: Math.floor(timestamp / 1000),
      wheels: generateRandomPrediction(),
      type: 'RNG_ESTIMATE',
      timestamp
    }));
  } else if (pathname === '/api/stats' && req.method === 'GET') {
    const data = loadPredictionData();
    if (!data) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No data available' }));
      return;
    }
    
    const accuracy = data.totalPredictions > 0 
      ? (data.correctPredictions / data.totalPredictions * 100).toFixed(2) 
      : 0;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalPredictions: data.totalPredictions,
      correctPredictions: data.correctPredictions,
      accuracy: accuracy + '%',
      patterns: data.patterns,
      lastUpdated: data.lastUpdated
    }));
  } else if (pathname === '/api/result' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { drawId, wheels } = JSON.parse(body);
        
        if (!drawId || !wheels || !Array.isArray(wheels)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid data' }));
          return;
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
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Result recorded and patterns updated' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else if (pathname === '/api/history' && req.method === 'GET') {
    const data = loadPredictionData();
    if (!data) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ history: [] }));
      return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      history: data.predictionHistory.slice(0, 20),
      total: data.predictionHistory.length
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

function serveStaticFile(res, filename, contentType) {
  const filePath = path.join(__dirname, filename);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Initialize and start server
initPredictionData();
initLiveResults();

// Start the prediction system
startPredictionSystem();

// Start server
server.listen(PORT, () => {
  console.log(`🚀 PowerSpin Simulator running on port ${PORT}`);
  console.log(`📊 Prediction system active - generating predictions every 4 minutes`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});
