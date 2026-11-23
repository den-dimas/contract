const express = require('express');
const { query, withTransaction } = require('../db');
const { parseAmount, parseId, cleanText } = require('../lib/parse');
const { findProject } = require('../lib/projectAccess');
const { breakdown, landedCost } = require('../lib/landedCost');
const { rankOffers, sortOffers, SORT_KEYS, SORT_RANK } = require('../lib/ranking');

const DUPLICATE_KEY_CODE = 'ER_DUP_ENTRY';
const MISSING_REF_CODE = 'ER_NO_REFERENCED_ROW_2';
const PERCENT = 100;
const DEFAULT_TAX_PERCENT = 5;
const MAX_TAX_PERCENT = 100;
const TAX_DIGITS = 4;
const PERCENT_DIGITS = 2;
const MAX_NAME = 120;
const MAX_LOCATION = 160;
const MAX_QUANTITY = 999999999999;
const MAX_DISTANCE = 999999;
const STATUS_PLACED = 'placed';
const STATUS_DELIVERED = 'delivered';
const FIRST_VERSION = 1;
const ERROR_TARGET = '#req-error';
const NOT_FOUND_MESSAGE = 'This project does not exist.';

const router = express.Router();

const notFound = (res, message = NOT_FOUND_MESSAGE) => (
  res.status(404).page('error', { title: 'Not found', message })
);

const toFraction = (percent) => Number((percent / PERCENT).toFixed(TAX_DIGITS));
const toPercent = (fraction) => Number((Number(fraction) * PERCENT).toFixed(PERCENT_DIGITS));
const goTo = (res, id, message) => {
  if (message) res.flash(message);
  res.redirect(`/projects/${id}`);
};

function readProjectForm(body) {
  const taxPercent = body.tax_percent === undefined || cleanText(body.tax_percent) === ''
    ? DEFAULT_TAX_PERCENT
    : parseAmount(body.tax_percent);
  return { name: cleanText(body.name), location: cleanText(body.location), tax_percent: taxPercent };
}

function validateProject(form) {
  if (!form.name || !form.location) return 'Fill in the name and the location.';
  if (form.name.length > MAX_NAME) return `Name can have at most ${MAX_NAME} characters.`;
  if (form.location.length > MAX_LOCATION) return `Location can have at most ${MAX_LOCATION} characters.`;
  if (form.tax_percent === null || form.tax_percent > MAX_TAX_PERCENT) {
    return `Tax must be from 0 to ${MAX_TAX_PERCENT} percent.`;
  }
  return null;
}

function showProjectForm(res, data) {
  res.page('projects/form', data);
}

async function listMaterialGroups() {
  const rows = await query(
    `SELECT m.id, m.standard_name, m.unit, c.name AS category
     FROM master_materials m JOIN categories c ON c.id = m.category_id
     ORDER BY c.name, m.standard_name`,
  );
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.category)) groups.set(row.category, { category: row.category, materials: [] });
    groups.get(row.category).materials.push(row);
  }
  return [...groups.values()];
}

const REQUIREMENT_SELECT = `SELECT q.id, q.project_id, q.material_id, q.required_quantity,
  m.standard_name AS material, m.unit, c.name AS category
  FROM project_requirements q
  JOIN master_materials m ON m.id = q.material_id
  JOIN categories c ON c.id = m.category_id`;

const listRequirements = (projectId) => query(
  `${REQUIREMENT_SELECT} WHERE q.project_id = ? ORDER BY c.name, m.standard_name`,
  [projectId],
);

const findRequirement = async (projectId, id) => {
  const rows = await query(`${REQUIREMENT_SELECT} WHERE q.id = ? AND q.project_id = ?`, [id, projectId]);
  return rows[0] ?? null;
};

const listOrders = (projectId) => query(
  `SELECT o.id, o.project_id, o.quantity, o.total_landed_cost, o.status, o.version_id,
          s.company_name AS supplier, m.standard_name AS material, m.unit,
          r.id AS rating_id, r.punctuality_score, r.quantity_score, r.comment
   FROM orders o
   JOIN suppliers s ON s.id = o.supplier_id
   JOIN supplier_catalogs c ON c.id = o.catalog_id
   JOIN master_materials m ON m.id = c.material_id
   LEFT JOIN ratings r ON r.order_id = o.id
   WHERE o.project_id = ? ORDER BY o.id DESC`,
  [projectId],
);

const sendRequirementError = (res, message) => {
  res.set({ 'HX-Retarget': ERROR_TARGET, 'HX-Reswap': 'innerHTML' });
  res.send(message);
};

const renderRow = (res, row) => res.render('partials/requirementRow', { layout: false, ...row });

async function buildSections(project, orgId, sortKey) {
  const requirements = await listRequirements(project.id);
  const taxRate = Number(project.tax_rate);
  return Promise.all(requirements.map(async (req) => {
    const quantity = Number(req.required_quantity);
    const rows = await query(
      `SELECT r.catalog_id, r.supplier_id, r.company_name, r.unit_price, r.capacity,
              r.delivery_rate_km, r.avg_score, r.rating_cnt,
              COALESCE(d.distance_km, 0) AS distance_km
       FROM v_supplier_rankings r
       LEFT JOIN project_supplier_distances d ON d.supplier_id = r.supplier_id AND d.project_id = ?
       WHERE r.org_id = ? AND r.material_id = ?
         AND r.capacity >= ?`,
      [project.id, orgId, req.material_id, quantity],
    );
    const offers = rows.map((row) => {
      const costs = breakdown({
        unitPrice: Number(row.unit_price),
        quantity,
        distanceKm: Number(row.distance_km),
        deliveryRateKm: Number(row.delivery_rate_km),
        taxRate,
      });
      return {
        catalogId: row.catalog_id,
        supplierId: row.supplier_id,
        name: row.company_name,
        unitPrice: row.unit_price,
        avgScore: row.avg_score === null ? null : Number(row.avg_score),
        ratingCnt: row.rating_cnt,
        distanceKm: Number(row.distance_km),
        costs,
        landedCost: costs.total,
      };
    });
    const sorted = sortOffers(rankOffers(offers), sortKey);
    return { requirement: req, offers: sorted.map((offer, idx) => ({ ...offer, position: idx + 1 })) };
  }));
}

const readSort = (value) => (SORT_KEYS.includes(value) ? value : SORT_RANK);

router.get('/', async (req, res) => {
  const projects = await query(
    `SELECT p.id, p.name, p.location, p.tax_rate,
            (SELECT COUNT(*) FROM project_requirements q WHERE q.project_id = p.id) AS requirement_cnt,
            (SELECT COUNT(*) FROM orders o WHERE o.project_id = p.id) AS order_cnt
     FROM projects p WHERE p.org_id = ? ORDER BY p.created_at DESC, p.id DESC`,
    [req.user.org_id],
  );
  res.page('projects/list', { title: 'Projects', projects });
});

router.get('/new', (req, res) => {
  showProjectForm(res, {
    title: 'New project',
    action: '/projects',
    form: { tax_percent: DEFAULT_TAX_PERCENT },
  });
});

router.post('/', async (req, res) => {
  const form = readProjectForm(req.body);
  const error = validateProject(form);
  if (error) {
    return showProjectForm(res.status(400), { title: 'New project', action: '/projects', form, error });
  }
  const result = await query(
    'INSERT INTO projects (org_id, created_by_user_id, name, location, tax_rate) VALUES (?, ?, ?, ?, ?)',
    [req.user.org_id, req.user.id, form.name, form.location, toFraction(form.tax_percent)],
  );
  goTo(res, result.insertId, 'Project created.');
});

router.get('/:id', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  const [requirements, orders, materialGroups] = await Promise.all([
    listRequirements(project.id),
    listOrders(project.id),
    listMaterialGroups(),
  ]);
  res.page('projects/show', {
    title: project.name,
    project: { ...project, tax_percent: toPercent(project.tax_rate) },
    requirements,
    orders,
    materialGroups,
  });
});

router.get('/:id/edit', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  showProjectForm(res, {
    title: 'Edit project',
    action: `/projects/${project.id}/edit`,
    form: { ...project, tax_percent: toPercent(project.tax_rate) },
    isEdit: true,
    projectId: project.id,
  });
});

router.post('/:id/edit', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  const form = readProjectForm(req.body);
  const error = validateProject(form);
  if (error) {
    return showProjectForm(res.status(400), {
      title: 'Edit project',
      action: `/projects/${project.id}/edit`,
      form,
      error,
      isEdit: true,
      projectId: project.id,
    });
  }
  await query(
    'UPDATE projects SET name = ?, location = ?, tax_rate = ? WHERE id = ? AND org_id = ?',
    [form.name, form.location, toFraction(form.tax_percent), project.id, req.user.org_id],
  );
  goTo(res, project.id, 'Project updated.');
});

router.post('/:id/delete', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  const [{ cnt }] = await query('SELECT COUNT(*) AS cnt FROM orders WHERE project_id = ?', [project.id]);
  if (cnt > 0) return goTo(res, project.id, 'This project has orders, so it cannot be deleted.');
  await query('DELETE FROM projects WHERE id = ? AND org_id = ?', [project.id, req.user.org_id]);
  res.flash('Project deleted.');
  res.redirect('/projects');
});

router.post('/:id/requirements', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  const materialId = parseId(req.body.material_id);
  const quantity = parseAmount(req.body.quantity);
  if (!materialId || !quantity || quantity > MAX_QUANTITY) {
    return sendRequirementError(res, 'Pick a material and enter a quantity above zero.');
  }
  let result;
  try {
    result = await query(
      'INSERT INTO project_requirements (project_id, material_id, required_quantity) VALUES (?, ?, ?)',
      [project.id, materialId, quantity],
    );
  } catch (err) {
    if (err.code === DUPLICATE_KEY_CODE) {
      return sendRequirementError(res, 'This material is already on the list. Change its quantity instead.');
    }
    if (err.code === MISSING_REF_CODE) return sendRequirementError(res, 'This material does not exist.');
    throw err;
  }
  renderRow(res, await findRequirement(project.id, result.insertId));
});

router.post('/:id/requirements/:reqId', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  const quantity = parseAmount(req.body.quantity);
  if (!quantity || quantity > MAX_QUANTITY) {
    return sendRequirementError(res, 'Quantity must be above zero.');
  }
  const reqId = parseId(req.params.reqId);
  const result = await query(
    'UPDATE project_requirements SET required_quantity = ? WHERE id = ? AND project_id = ?',
    [quantity, reqId, project.id],
  );
  if (result.affectedRows === 0) return notFound(res, 'This requirement does not exist.');
  renderRow(res, await findRequirement(project.id, reqId));
});

router.delete('/:id/requirements/:reqId', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  await query('DELETE FROM project_requirements WHERE id = ? AND project_id = ?', [parseId(req.params.reqId), project.id]);
  res.send('');
});

router.get('/:id/compare', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  const sort = readSort(req.query.sort);
  const sections = await buildSections(project, req.user.org_id, sort);
  res.page('projects/compare', { title: `Compare suppliers for ${project.name}`, project, sort, sections });
});

router.post('/:id/distances', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  const supplierId = parseId(req.body.supplier_id);
  const distance = parseAmount(req.body.distance_km);
  const sort = readSort(req.body.sort);
  const owned = supplierId
    ? await query('SELECT id FROM suppliers WHERE id = ? AND org_id = ?', [supplierId, req.user.org_id])
    : [];
  const isValid = owned.length > 0 && distance !== null && distance <= MAX_DISTANCE;
  if (isValid) {
    await query(
      `INSERT INTO project_supplier_distances (project_id, supplier_id, distance_km) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE distance_km = VALUES(distance_km)`,
      [project.id, supplierId, distance],
    );
  }
  const sections = await buildSections(project, req.user.org_id, sort);
  res.render('partials/compareBody', {
    layout: false,
    project,
    sort,
    sections,
    error: isValid ? null : `Distance must be from 0 to ${MAX_DISTANCE} km.`,
  });
});

/**
 * Locks the catalog row, checks capacity, then saves the order and lowers the capacity.
 * @returns {Promise<{error: string}|{orderId: number}>}
 */
function placeOrder({ project, catalogId, orgId, userId }) {
  return withTransaction(async (conn) => {
    const [catalogs] = await conn.execute(
      `SELECT c.id, c.supplier_id, c.material_id, c.unit_price, c.capacity, c.delivery_rate_km
       FROM supplier_catalogs c JOIN suppliers s ON s.id = c.supplier_id
       WHERE c.id = ? AND s.org_id = ? AND s.status = 'active' FOR UPDATE`,
      [catalogId, orgId],
    );
    const catalog = catalogs[0];
    if (!catalog) return { error: 'This supplier offer is not available.' };

    const [requirements] = await conn.execute(
      'SELECT required_quantity FROM project_requirements WHERE project_id = ? AND material_id = ?',
      [project.id, catalog.material_id],
    );
    if (!requirements[0]) return { error: 'This project does not need that material.' };
    const quantity = Number(requirements[0].required_quantity);
    if (Number(catalog.capacity) < quantity) {
      return { error: 'This supplier no longer has enough capacity for the order.' };
    }

    const [distances] = await conn.execute(
      'SELECT distance_km FROM project_supplier_distances WHERE project_id = ? AND supplier_id = ?',
      [project.id, catalog.supplier_id],
    );
    const total = landedCost({
      unitPrice: Number(catalog.unit_price),
      quantity,
      distanceKm: Number(distances[0]?.distance_km ?? 0),
      deliveryRateKm: Number(catalog.delivery_rate_km),
      taxRate: Number(project.tax_rate),
    });
    const [inserted] = await conn.execute(
      `INSERT INTO orders (project_id, supplier_id, catalog_id, placed_by_user_id, quantity, total_landed_cost, status, version_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [project.id, catalog.supplier_id, catalog.id, userId, quantity, total, STATUS_PLACED, FIRST_VERSION],
    );
    await conn.execute('UPDATE supplier_catalogs SET capacity = capacity - ? WHERE id = ?', [quantity, catalog.id]);
    return { orderId: inserted.insertId };
  });
}

router.post('/:id/orders', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  const catalogId = parseId(req.body.catalog_id);
  if (!catalogId) return goTo(res, project.id, 'Pick a supplier offer to order.');
  const result = await placeOrder({ project, catalogId, orgId: req.user.org_id, userId: req.user.id });
  goTo(res, project.id, result.error ?? 'Order placed.');
});

router.post('/:id/orders/:orderId/deliver', async (req, res) => {
  const project = await findProject(parseId(req.params.id), req.user.org_id);
  if (!project) return notFound(res);
  const orderId = parseId(req.params.orderId);
  const versionId = parseId(req.body.version_id);
  if (!orderId || !versionId) return notFound(res, 'This order does not exist.');
  const result = await query(
    `UPDATE orders SET status = ?, version_id = version_id + 1
     WHERE id = ? AND project_id = ? AND version_id = ? AND status = ?`,
    [STATUS_DELIVERED, orderId, project.id, versionId, STATUS_PLACED],
  );
  const message = result.affectedRows === 0
    ? 'This order was changed by someone else. Refresh the page and try again.'
    : 'Order marked as delivered.';
  goTo(res, project.id, message);
});

router.use('/:id/orders/:orderId/rating', require('./ratings'));

module.exports = router;
