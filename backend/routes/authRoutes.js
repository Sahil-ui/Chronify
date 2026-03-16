const express = require('express');

const { signup, login, logout } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const {
  authLoginLimiter,
  authSignupLimiter,
} = require('../middleware/rateLimiters');

const router = express.Router();

// Public auth routes
router.post('/signup', authSignupLimiter, signup);
router.post('/login', authLoginLimiter, login);

// Private auth routes
router.post('/logout', protect, logout);

module.exports = router;

