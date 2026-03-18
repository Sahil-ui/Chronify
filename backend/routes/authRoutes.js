const express = require('express');

const { signup, login, logout, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const {
  authLoginLimiter,
  authSignupLimiter,
} = require('../middleware/rateLimiters');

const router = express.Router();

// Public auth routes
router.post('/signup', authSignupLimiter, signup);
router.post('/login', authLoginLimiter, login);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);

// Private auth routes
router.post('/logout', protect, logout);

module.exports = router;

