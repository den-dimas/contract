const { query } = require('../db');
const { parseId } = require('../lib/parse');

const COOKIE_NAME = 'userId';
const SESSION_MS = 8 * 60 * 60 * 1000;

const cookieOptions = { signed: true, httpOnly: true, maxAge: SESSION_MS };

/**
 * Loads the logged in user from the signed cookie into req.user.
 */
async function loadUser(req, res, next) {
  const id = parseId(req.signedCookies[COOKIE_NAME]);
  if (id) {
    const rows = await query(
      "SELECT id, org_id, name, email, role FROM users WHERE id = ? AND seat_status = 'active'",
      [id],
    );
    req.user = rows[0] ?? null;
  }
  res.locals.user = req.user ?? null;
  next();
}

function requireLogin(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

function startSession(res, userId) {
  res.cookie(COOKIE_NAME, String(userId), cookieOptions);
}

function endSession(res) {
  res.clearCookie(COOKIE_NAME);
}

module.exports = { loadUser, requireLogin, startSession, endSession };
