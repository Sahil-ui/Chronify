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

// The logout route currently has a rate limiter.
// In practice, limiting logout requests is usually unnecessary since logout is not a destructive or resource-intensive action.
// You can safely remove this limiter unless you have a specific reason (e.g., to prevent some kind of abuse).
// If not needed, simply remove this:
// const authLogoutLimiter = createLimiter({
//   windowMs: 5 * 60 * 1000,
//   max: 60,
//   message: 'Too many logout requests, please try again later.',
// });

// If you want to keep the code but disable it for now:
// const authLogoutLimiter = (req, res, next) => next();

module.exports = {
  authLoginLimiter,
  authSignupLimiter,
};

