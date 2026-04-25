const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const googleCalendarService = require('../services/googleCalendarService');
const googleAuthService = require('../services/googleAuthService');

const createToken = (userId, tokenVersion = 0) => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  if (!secret) {
    throw new Error('JWT_SECRET is not set. Please define it in your environment variables.');
  }

  return jwt.sign({ sub: userId, tv: tokenVersion }, secret, { expiresIn });
};

const getFrontendBaseUrl = (req) => {
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL.replace(/\/+$/, '');
  }

  const currentHost = req.get('host') || 'localhost:5000';
  if (currentHost.includes('localhost')) {
    return `${req.protocol}://localhost:3000`;
  }
  return `${req.protocol}://${currentHost}`;
};

// @desc    User signup
// @route   POST /api/v1/auth/signup
// @access  Public
const signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({ message: 'Email is already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    const token = createToken(user._id, user.tokenVersion || 0);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        productivityScore: user.productivityScore,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    User login
// @route   POST /api/v1/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = createToken(user._id, user.tokenVersion || 0);

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        productivityScore: user.productivityScore,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    User logout (invalidate existing tokens)
// @route   POST /api/v1/auth/logout
// @access  Private
const logout = async (req, res, next) => {
  try {
    // Incrementing tokenVersion invalidates all previously issued JWTs for this user.
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });

    res.status(200).json({ message: 'Logged out' });
  } catch (error) {
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /api/v1/auth/forgotpassword
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });

    if (!user) {
      return res.status(404).json({ message: 'There is no user with that email' });
    }

    // Get reset token
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave: false });

    // Create reset url
    // Target the frontend dev server running on port 3000
    const currentHost = req.get('host');
    const frontendHost = currentHost.includes('localhost') 
      ? 'localhost:3000' 
      : currentHost;
    
    const resetUrl = `${req.protocol}://${frontendHost}/reset-password/${resetToken}`;

    const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Please make a PUT request to: \n\n ${resetUrl}`;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Password reset token',
        message,
        html: `<p>You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password. If it does not work, visit:</p><br/><code>${resetUrl}</code>`,
      });

      res.status(200).json({ success: true, message: 'Email sent' });
    } catch (err) {
      console.error(err);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save({ validateBeforeSave: false });

      return res.status(500).json({ message: 'Email could not be sent' });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resettoken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Set new password
    if (!req.body.password) {
      return res.status(400).json({ message: 'Please provide a password' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(req.body.password, salt);
    
    // Clear reset credentials
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    
    // Invalidate earlier tokens (logout everywhere)
    user.tokenVersion = (user.tokenVersion || 0) + 1;

    await user.save();

    // Generate new JWT
    const token = createToken(user._id, user.tokenVersion);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        productivityScore: user.productivityScore,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Google Calendar integration status
// @route   GET /api/v1/auth/google-calendar/status
// @access  Private
const googleCalendarStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const status = googleCalendarService.getGoogleCalendarStatus(user);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
};

// @desc    Create Google OAuth URL for calendar connect
// @route   POST /api/v1/auth/google-calendar/connect
// @access  Private
const connectGoogleCalendar = async (req, res, next) => {
  try {
    if (!googleCalendarService.hasGoogleCalendarConfig()) {
      return res.status(503).json({
        message:
          'Google Calendar is not configured on server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.',
      });
    }

    const user = await User.findById(req.user._id).select(
      '+googleCalendar.accessToken +googleCalendar.refreshToken'
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const state = googleCalendarService.generateOAuthState();
    const expireAt = new Date(Date.now() + 10 * 60 * 1000);

    user.googleCalendar = user.googleCalendar || {};
    user.googleCalendar.oauthState = state;
    user.googleCalendar.oauthStateExpire = expireAt;
    await user.save({ validateBeforeSave: false });

    const authUrl = googleCalendarService.buildOAuthUrl(state);
    res.status(200).json({ authUrl });
  } catch (error) {
    next(error);
  }
};

// @desc    Google OAuth callback
// @route   GET /api/v1/auth/google-calendar/callback
// @access  Public
const handleGoogleCalendarCallback = async (req, res, next) => {
  const frontendBaseUrl = getFrontendBaseUrl(req);

  try {
    if (!googleCalendarService.hasGoogleCalendarConfig()) {
      return res.redirect(`${frontendBaseUrl}/goals?google_calendar=not_configured`);
    }

    const { state, code, error } = req.query;

    if (error) {
      return res.redirect(`${frontendBaseUrl}/goals?google_calendar=error`);
    }

    if (!state || !code) {
      return res.redirect(`${frontendBaseUrl}/goals?google_calendar=invalid_callback`);
    }

    const user = await User.findOne({
      'googleCalendar.oauthState': state.toString(),
      'googleCalendar.oauthStateExpire': { $gt: new Date() },
    }).select('+googleCalendar.accessToken +googleCalendar.refreshToken');

    if (!user) {
      return res.redirect(`${frontendBaseUrl}/goals?google_calendar=invalid_state`);
    }

    const tokenData = await googleCalendarService.exchangeCodeForTokens(code.toString());
    const email = await googleCalendarService.fetchGoogleUserEmail(tokenData.access_token);

    user.googleCalendar = user.googleCalendar || {};
    user.googleCalendar.connected = true;
    user.googleCalendar.email = email || user.email;
    user.googleCalendar.calendarId = user.googleCalendar.calendarId || 'primary';
    user.googleCalendar.accessToken = tokenData.access_token;
    user.googleCalendar.refreshToken =
      tokenData.refresh_token || user.googleCalendar.refreshToken;
    user.googleCalendar.tokenExpiryDate = googleCalendarService.tokenExpiryFromNow(
      tokenData.expires_in
    );
    user.googleCalendar.syncEnabled = true;
    user.googleCalendar.oauthState = undefined;
    user.googleCalendar.oauthStateExpire = undefined;
    user.googleCalendar.lastSyncError = undefined;

    await user.save({ validateBeforeSave: false });

    return res.redirect(`${frontendBaseUrl}/goals?google_calendar=connected`);
  } catch (error) {
    try {
      if (req.query.state) {
        const user = await User.findOne({
          'googleCalendar.oauthState': req.query.state.toString(),
        }).select('+googleCalendar.accessToken +googleCalendar.refreshToken');

        if (user) {
          user.googleCalendar = user.googleCalendar || {};
          user.googleCalendar.oauthState = undefined;
          user.googleCalendar.oauthStateExpire = undefined;
          user.googleCalendar.lastSyncError = (error.message || 'OAuth callback failed').slice(
            0,
            500
          );
          await user.save({ validateBeforeSave: false });
        }
      }
    } catch (innerError) {
      // ignore callback cleanup failures
    }

    if (!res.headersSent) {
      return res.redirect(`${frontendBaseUrl}/goals?google_calendar=failed`);
    }

    next(error);
  }
};

// @desc    Disconnect Google Calendar integration
// @route   POST /api/v1/auth/google-calendar/disconnect
// @access  Private
const disconnectGoogleCalendar = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      '+googleCalendar.accessToken +googleCalendar.refreshToken'
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.googleCalendar = user.googleCalendar || {};
    user.googleCalendar.connected = false;
    user.googleCalendar.syncEnabled = false;
    user.googleCalendar.accessToken = undefined;
    user.googleCalendar.refreshToken = undefined;
    user.googleCalendar.tokenExpiryDate = undefined;
    user.googleCalendar.oauthState = undefined;
    user.googleCalendar.oauthStateExpire = undefined;
    user.googleCalendar.lastSyncError = undefined;

    await user.save({ validateBeforeSave: false });

    res.status(200).json({ message: 'Google Calendar disconnected' });
  } catch (error) {
    next(error);
  }
};

// @desc    Initiate Google Login
// @route   GET /api/v1/auth/google
// @access  Public
const initiateGoogleLogin = (req, res) => {
  const state = googleAuthService.generateState();
  const authUrl = googleAuthService.buildAuthUrl(state);
  console.log('Initiating Google Login with URL:', authUrl);
  res.redirect(authUrl);
};

// @desc    Handle Google Login Callback
// @route   GET /api/v1/auth/google/callback
// @access  Public
const handleGoogleLoginCallback = async (req, res, next) => {
  const frontendBaseUrl = getFrontendBaseUrl(req);
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`${frontendBaseUrl}/login?error=google_auth_failed`);
  }

  try {
    const googleUser = await googleAuthService.getUserInfoFromCode(code);
    const { email, name, sub: googleId, picture } = googleUser;

    let user = await User.findOne({ email });

    if (user) {
      // Update existing user with Google ID if not present
      if (!user.googleId) {
        user.googleId = googleId;
        if (picture) user.profilePicture = picture;
        await user.save({ validateBeforeSave: false });
      }
    } else {
      // Create new user (Signup)
      user = await User.create({
        name,
        email,
        googleId,
        profilePicture: picture,
        password: crypto.randomBytes(16).toString('hex'), // Random password for OAuth users
      });
    }

    const token = createToken(user._id, user.tokenVersion || 0);

    // Redirect to frontend with token
    // We'll use a special callback page on the frontend to handle this
    res.redirect(`${frontendBaseUrl}/auth/callback?token=${token}&id=${user._id}&name=${encodeURIComponent(user.name)}&email=${user.email}`);
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.redirect(`${frontendBaseUrl}/login?error=google_auth_error`);
  }
};

module.exports = {
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
};
