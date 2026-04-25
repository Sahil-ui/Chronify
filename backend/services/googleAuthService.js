const fetch = require('node-fetch');
const crypto = require('crypto');

const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

const AUTH_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

/**
 * Builds the URL for Google OAuth consent screen
 * @param {string} state - Random string to prevent CSRF
 * @returns {string} The auth URL
 */
const buildAuthUrl = (state) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: process.env.GOOGLE_AUTH_REDIRECT_URI || '',
    response_type: 'code',
    scope: AUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
};

/**
 * Exchanges OAuth code for tokens and fetches user info
 * @param {string} code - The code from Google callback
 */
const getUserInfoFromCode = async (code) => {
  // 1. Exchange code for tokens
  const tokenBody = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: process.env.GOOGLE_AUTH_REDIRECT_URI || '',
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });

  if (!tokenRes.ok) {
    const error = await tokenRes.json();
    throw new Error(error.error_description || 'Failed to exchange Google OAuth code');
  }

  const { access_token } = await tokenRes.json();

  // 2. Fetch user profile with the access token
  const userRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) {
    throw new Error('Failed to fetch user info from Google');
  }

  return userRes.json();
};

const generateState = () => crypto.randomBytes(32).toString('hex');

module.exports = {
  buildAuthUrl,
  getUserInfoFromCode,
  generateState,
};
