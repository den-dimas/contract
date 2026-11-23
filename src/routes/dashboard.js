const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const [supplierRows, projectRows] = await Promise.all([
    query("SELECT COUNT(*) AS cnt FROM suppliers WHERE org_id = ? AND status = 'active'", [req.user.org_id]),
    query('SELECT COUNT(*) AS cnt FROM projects WHERE org_id = ?', [req.user.org_id]),
  ]);
  const counts = { suppliers: supplierRows[0].cnt, projects: projectRows[0].cnt };
  res.page('dashboard', { title: 'Dashboard', counts });
});

module.exports = router;
