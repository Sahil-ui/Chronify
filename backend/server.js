const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');

// Load environment variables from backend/.env before importing anything that relies on them
dotenv.config({ path: require('path').join(__dirname, '.env') });

const { connectDB } = require('../config/db');
const authRoutes = require('./routes/authRoutes');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Global middlewares
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies

// Optional HTTP request logging in non-test environments
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

// Mount feature routes
app.use('/api/v1/auth', authRoutes);

// Not found handler
app.use((req, res, next) => {
  res.status(404).json({
    message: 'Route not found',
  });
});

// Centralized error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  const statusCode = err.statusCode || 500;
  const message =
    err.message || 'An unexpected error occurred. Please try again later.';

  res.status(statusCode).json({
    message,
  });
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Chronify API server running on port  http://localhost:${PORT}`);
});

module.exports = app;

