# PowerSpin Simulator

A 1:1 PowerSpin simulator with live mirror functionality and 24/7 prediction system designed to match PowerSpin RNG patterns over time.

## Features

- **Live Mirror**: Attempts to fetch official PowerSpin results from OPAP APIs
- **Local RNG Fallback**: Uses accurate 27-slot wheel simulation when live data unavailable
- **24/7 Prediction System**: Continuous prediction generation with pattern learning
- **Smart Algorithm**: Adapts predictions based on historical data patterns
- **Uptime Monitoring**: Health check endpoint for monitoring services
- **Vercel Ready**: Optimized for serverless deployment

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

## Local Development

```bash
npm start
```

The server will start on `http://localhost:3000`

## Deployment

### GitHub Setup

1. Initialize git repository (already done)
2. Create a new repository on GitHub
3. Add remote and push:
```bash
git remote add origin https://github.com/yourusername/powerspin-simulator.git
git branch -M main
git push -u origin main
```

### Vercel Deployment

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel
```

3. Follow the prompts to connect to your GitHub repository

4. Set environment variables if needed (none required for basic operation)

### Uptime Monitoring

Set up uptime monitoring to ping the health endpoint every 1 minute:
- Health endpoint: `https://your-app.vercel.app/health`
- Expected response: JSON with `status: "healthy"`

This keeps the Vercel server active and ensures continuous predictions.

## API Endpoints

- `GET /health` - Health check for uptime monitoring
- `GET /api/prediction` - Get current prediction
- `GET /api/stats` - Get prediction statistics and accuracy
- `POST /api/result` - Submit live result for pattern learning
- `GET /api/history` - Get prediction history

## Prediction System

The system generates predictions every 4 minutes (matching PowerSpin draw cycle):

1. **Random Phase**: First 10 predictions use random generation
2. **Smart Phase**: After 10 predictions, uses pattern-based algorithm
3. **Learning**: Each live result updates pattern frequencies
4. **Adaptation**: Probabilities adjust based on historical data

## Pattern Tracking

- Number frequency (1-24)
- Symbol frequency (SPIN occurrences)
- Zone distribution (RED/GREEN/BLUE)
- Over/Under distribution

## Files

- `server.js` - Express server with prediction system
- `index.html` - Frontend simulator interface
- `app.js` - Frontend application logic
- `engine.js` - Game engine and evaluation
- `powerspin-engine.js` - Alternative engine implementation
- `simulator.js` - CLI simulator
- `style.css` - Styling

## License

MIT