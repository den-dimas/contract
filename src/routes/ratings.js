const express = require('express');
const { query } = require('../db');
const { parseId, cleanText } = require('../lib/parse');
const { findProject, findOrder } = require('../lib/projectAccess');

const DUPLICATE_KEY_CODE = 'ER_DUP_ENTRY';
const MIN_SCORE = 1;
const MAX_SCORE = 5;
const MAX_COMMENT = 500;
const SCORES = Array.from({ length: MAX_SCORE - MIN_SCORE + 1 }, (_, idx) => MIN_SCORE + idx);
const STATUS_DELIVERED = 'delivered';
const NOT_FOUND_MESSAGE = 'This order does not exist.';

const router = express.Router({ mergeParams: true });

const isScore = (num) => num !== null && num >= MIN_SCORE && num <= MAX_SCORE;

function readForm(body) {
  return {
    punctuality_score: parseId(body.punctuality_score),
    quantity_score: parseId(body.quantity_score),
    comment: cleanText(body.comment),
  };
}

function validate(form) {
  if (!isScore(form.punctuality_score) || !isScore(form.quantity_score)) {
    return `Scores must be from ${MIN_SCORE} to ${MAX_SCORE}.`;
  }
  if (form.comment.length > MAX_COMMENT) return `Comment can have at most ${MAX_COMMENT} characters.`;
  return null;
}

router.use(async (req, res, next) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  const order = project ? await findOrder(project.id, parseId(req.params.orderId)) : null;
  if (!order) {
    return res.status(404).page('error', { title: 'Not found', message: NOT_FOUND_MESSAGE });
  }
  if (order.status !== STATUS_DELIVERED) {
    res.flash('Only delivered orders can be rated.');
    return res.redirect(`/projects/${project.id}`);
  }
  req.project = project;
  req.order = order;
  next();
});

const back = (req) => `/projects/${req.project.id}`;

function showForm(res, req, extra = {}) {
  const hasRating = Boolean(req.order.rating_id);
  res.page('projects/rating', {
    title: hasRating ? 'Edit rating' : 'Rate delivery',
    project: req.project,
    order: req.order,
    action: hasRating ? 'edit' : '',
    scores: SCORES,
    form: hasRating ? req.order : {},
    ...extra,
  });
}

router.get('/new', (req, res) => {
  if (req.order.rating_id) return res.redirect(`${back(req)}/orders/${req.order.id}/rating/edit`);
  showForm(res, req);
});

router.post('/', async (req, res) => {
  const form = readForm(req.body);
  const error = validate(form);
  if (error) return showForm(res.status(400), req, { form, error });
  try {
    await query(
      'INSERT INTO ratings (order_id, created_by_user_id, punctuality_score, quantity_score, comment) VALUES (?, ?, ?, ?, ?)',
      [req.order.id, req.user.id, form.punctuality_score, form.quantity_score, form.comment || null],
    );
  } catch (err) {
    if (err.code !== DUPLICATE_KEY_CODE) throw err;
    res.flash('This order is already rated.');
    return res.redirect(back(req));
  }
  res.flash('Rating saved.');
  res.redirect(back(req));
});

router.get('/edit', (req, res) => {
  if (!req.order.rating_id) return res.redirect(`${back(req)}/orders/${req.order.id}/rating/new`);
  showForm(res, req);
});

router.post('/edit', async (req, res) => {
  const form = readForm(req.body);
  const error = validate(form);
  if (error) return showForm(res.status(400), req, { form, error });
  await query(
    'UPDATE ratings SET punctuality_score = ?, quantity_score = ?, comment = ? WHERE order_id = ?',
    [form.punctuality_score, form.quantity_score, form.comment || null, req.order.id],
  );
  res.flash('Rating updated.');
  res.redirect(back(req));
});

router.post('/delete', async (req, res) => {
  await query('DELETE FROM ratings WHERE order_id = ?', [req.order.id]);
  res.flash('Rating deleted.');
  res.redirect(back(req));
});

module.exports = router;
