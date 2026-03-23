const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

// Load environment variables from backend/.env before importing anything that relies on them
dotenv.config({ path: path.join(__dirname, '.env') });

const { connectDB } = require('../config/db');
const authRoutes = require('./routes/authRoutes');
const goalRoutes = require('./routes/goalRoutes');
const taskRoutes = require('./routes/taskRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const aiRoutes = require('./routes/aiRoutes');
const { startJobs } = require('./jobs');

// Initialize Express app
const app = express();

// If you deploy behind a proxy/load balancer, set TRUST_PROXY=true
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Connect to MongoDB
connectDB();

// Start background jobs (e.g., reminder engine)
startJobs();

// Global middlewares
app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Mount API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/goals', goalRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/ai', aiRoutes);

// ── Centralized error handler ──────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.message === 'Oops your AI credits are expired') {
    return res.status(402).json({
      message: 'Oops your AI credits are expired',
      error: 'Oops your AI credits are expired',
    });
  }
  if (err.statusCode === 401 || err.statusCode === 403) {
    return res.status(err.statusCode).json({ message: err.message });
  }
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) console.error('❌ Server error:', err);
  else console.warn('⚠️ Client error:', err.message);
  res.status(statusCode).json({
    message: err.message || 'An unexpected error occurred. Please try again later.',
  });
});

// ── Boot ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const nextStandalonePath = path.join(__dirname, '../frontend/.next/standalone');
const NEXT_PORT = 3001;

/** Poll until port is accepting connections, then resolve. */
function waitForPort(port, maxWaitMs = 60000, intervalMs = 1000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + maxWaitMs;
    const check = () => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/' }, () => {
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() < deadline) {
          setTimeout(check, intervalMs);
        } else {
          console.warn(`⚠️ Next.js did not become ready within ${maxWaitMs / 1000}s — starting Express anyway`);
          resolve(false);
        }
      });
      req.end();
    };
    check();
  });
}

async function boot() {
  if (fs.existsSync(nextStandalonePath)) {
    // 1. Spawn the Next.js standalone server on an internal port
    const nextServerPath = path.join(nextStandalonePath, 'server.js');
    const nextProc = spawn(process.execPath, [nextServerPath], {
      env: { ...process.env, PORT: String(NEXT_PORT), HOSTNAME: '127.0.0.1' },
      stdio: 'inherit',
    });
    nextProc.on('error', (err) => console.error('❌ Next.js process error:', err));
    nextProc.on('exit', (code) => console.warn(`⚠️ Next.js process exited with code ${code}`));

    // 2. Wait until Next.js is accepting connections
    console.log(`⏳ Waiting for Next.js to be ready on port ${NEXT_PORT}…`);
    await waitForPort(NEXT_PORT);
    console.log(`✅ Next.js is ready — starting Express on port ${PORT}`);

    // 3. Register proxy catch-all AFTER Next.js is confirmed up
    app.use((req, res) => {
      const options = {
        hostname: '127.0.0.1',
        port: NEXT_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${NEXT_PORT}` },
      };
      const proxy = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });
      proxy.on('error', (err) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) res.status(502).json({ message: 'Frontend unavailable.' });
      });
      req.pipe(proxy, { end: true });
    });
  } else {
    console.warn('⚠️  Next.js standalone build not found — only API routes active.');
    app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
  }

  // 4. Start Express
  app.listen(PORT, () => {
    console.log(`🚀 Chronify server running on port ${PORT}`);
  });
}

boot().catch((err) => {
  console.error('❌ Boot failed:', err);
  process.exit(1);
});

module.exports = app;
