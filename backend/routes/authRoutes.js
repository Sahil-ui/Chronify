const express = require('express');

const {
  signup,
  login,
  logout,
  forgotPassword,
  resetPassword,
  googleCalendarStatus,
  connectGoogleCalendar,
  handleGoogleCalendarCallback,
  disconnectGoogleCalendar,
  initiateGoogleLogin,
  handleGoogleLoginCallback,
} = require('../controllers/authController');
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
router.get('/google-calendar/callback', handleGoogleCalendarCallback);

// Private auth routes
router.post('/logout', protect, logout);
router.get('/google-calendar/status', protect, googleCalendarStatus);
router.post('/google-calendar/connect', protect, connectGoogleCalendar);
router.post('/google-calendar/disconnect', protect, disconnectGoogleCalendar);

// Google Sign-in/Signup routes
router.get('/google', initiateGoogleLogin);
router.get('/google/callback', handleGoogleLoginCallback);

module.exports = router;
