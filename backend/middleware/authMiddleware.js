const jwt = require('jsonwebtoken');

const User = require('../models/User');

// Protect routes - requires valid JWT in Authorization header
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized, token missing' });
    }

    const token = authHeader.split(' ')[1];

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      return res
        .status(500)
        .json({ message: 'JWT secret is not configured on the server' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ message: 'Not authorized, token invalid' });
    }

    const user = await User.findById(decoded.sub);

    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    const decodedTokenVersion = typeof decoded.tv === 'number' ? decoded.tv : 0;
    const currentTokenVersion = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;

    if (decodedTokenVersion !== currentTokenVersion) {
      return res.status(401).json({ message: 'Not authorized, token revoked' });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  protect,
};

