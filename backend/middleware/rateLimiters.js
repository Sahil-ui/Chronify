const rateLimit = require('express-rate-limit');

const createLimiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
  });

// Brute force protection for auth endpoints
const authLoginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts, please try again later.',
});

const authSignupLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many signup attempts, please try again later.',
});

// Generic API Limiter (useful for AI routes)
const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.',
});

module.exports = {
  authLoginLimiter,
  authSignupLimiter,
  apiLimiter,
};

