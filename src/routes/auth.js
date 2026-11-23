const express = require('express');
const { query, withTransaction } = require('../db');
const { hashPassword, verifyPassword } = require('../lib/password');
const { cleanText } = require('../lib/parse');
const { startSession, endSession } = require('../middleware/auth');

const MIN_PASSWORD_LENGTH = 8;
const DUPLICATE_KEY_CODE = 'ER_DUP_ENTRY';
const BAD_LOGIN_MESSAGE = 'Email or password is wrong.';

const router = express.Router();

router.get('/', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.page('home');
});

router.get('/login', (req, res) => res.page('login', { title: 'Log in' }));

router.post('/login', async (req, res) => {
  const email = cleanText(req.body.email).toLowerCase();
  const rows = await query(
    "SELECT id, password_hash FROM users WHERE email = ? AND seat_status = 'active'",
    [email],
  );
  const found = rows[0];
  const isValid = found && await verifyPassword(String(req.body.password ?? ''), found.password_hash);
  if (!isValid) {
    return res.status(401).page('login', { title: 'Log in', email, error: BAD_LOGIN_MESSAGE });
  }
  startSession(res, found.id);
  res.redirect('/dashboard');
});

router.get('/signup', (req, res) => res.page('signup', { title: 'Sign up' }));

router.post('/signup', async (req, res) => {
  const form = {
    companyName: cleanText(req.body.companyName),
    name: cleanText(req.body.name),
    email: cleanText(req.body.email).toLowerCase(),
  };
  const password = String(req.body.password ?? '');
  const fail = (error) => res.status(400).page('signup', { title: 'Sign up', form, error });

  if (!form.companyName || !form.name || !form.email) return fail('Fill in every field.');
  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(`Password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const passwordHash = await hashPassword(password);
  try {
    const userId = await withTransaction(async (conn) => {
      const [org] = await conn.execute('INSERT INTO organizations (company_name) VALUES (?)', [form.companyName]);
      const [user] = await conn.execute(
        "INSERT INTO users (org_id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'admin')",
        [org.insertId, form.email, form.name, passwordHash],
      );
      return user.insertId;
    });
    startSession(res, userId);
    res.redirect('/dashboard');
  } catch (err) {
    if (err.code === DUPLICATE_KEY_CODE) return fail('This email is already registered.');
    throw err;
  }
});

router.post('/logout', (req, res) => {
  endSession(res);
  res.redirect('/');
});

module.exports = router;
