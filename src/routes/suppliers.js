
const express = require('express');
const { query } = require('../db');
const { parseId, parseAmount, cleanText } = require('../lib/parse');
const {
  MAX_AMOUNT,
  MAX_NAME_LENGTH,
  MAX_LICENSE_LENGTH,
} = require('../lib/importRow');

const DUPLICATE_KEY_CODE = 'ER_DUP_ENTRY';
const REFERENCED_CODE = 'ER_ROW_IS_REFERENCED_2';
const MISSING_PARENT_CODE = 'ER_NO_REFERENCED_ROW_2';

const STATUS_ACTIVE = 'active';
const STATUS_INACTIVE = 'inactive';
const STATUS_ALL = 'all';

const STATUSES = [
  STATUS_ACTIVE,
  STATUS_INACTIVE,
  STATUS_ALL,
];

const SUPPLIER_ROW_VIEW = 'partials/supplierRow';
const CATALOG_ROW_VIEW = 'partials/catalogRow';

const router = express.Router();

// ==========================================
// Supplier Functions
// ==========================================

// Find supplier belonging to the current organization
function findSupplier(id, orgId) {
  return query(
    `SELECT
       id,
       org_id,
       company_name,
       license_no,
       trade_name,
       phone,
       email,
       address,
       description,
       status,
       (SELECT COUNT(*)
        FROM supplier_catalogs c
        WHERE c.supplier_id = suppliers.id) AS catalog_cnt
     FROM suppliers
     WHERE id = ? AND org_id = ?`,
    [id, orgId],
  ).then((rows) => rows[0] ?? null);
}

// Get all available materials
function listMaterials() {
  return query(
    `SELECT id, standard_name, unit
     FROM master_materials
     ORDER BY standard_name`,
  );
}

// Get supplier catalog
function listCatalog(supplierId) {
  return query(
    `SELECT
       c.id,
       c.supplier_id,
       c.unit_price,
       c.capacity,
       c.delivery_rate_km,
       m.id AS material_id,
       m.standard_name,
       m.unit
     FROM supplier_catalogs c
     JOIN master_materials m ON m.id = c.material_id
     WHERE c.supplier_id = ?
     ORDER BY m.standard_name`,
    [supplierId],
  );
}

// Find a specific catalog row
function findCatalogRow(id, supplierId) {
  return query(
    `SELECT
       c.id,
       c.supplier_id,
       c.material_id,
       c.unit_price,
       c.capacity,
       c.delivery_rate_km,
       m.standard_name,
       m.unit
     FROM supplier_catalogs c
     JOIN master_materials m ON m.id = c.material_id
     WHERE c.id = ? AND c.supplier_id = ?`,
    [id, supplierId],
  ).then((rows) => rows[0] ?? null);
}

// Handle supplier not found
function notFound(res) {
  return res.status(404).page('error', {
    title: 'Not found',
    message: 'This supplier does not exist.',
  });
}

// ==========================================
// Supplier Form Validation
// ==========================================

function readSupplierForm(body) {
  const form = {
    company_name: cleanText(body.companyName),
    license_no: cleanText(body.licenseNo),
    trade_name: cleanText(body.tradeName),
    phone: cleanText(body.phone),
    email: cleanText(body.email),
    address: cleanText(body.address),
    description: cleanText(body.description),
  };

  const limits = {
    company_name: MAX_NAME_LENGTH,
    license_no: MAX_LICENSE_LENGTH,
    trade_name: 120,
    phone: 40,
    email: 160,
    address: 200,
    description: 200,
  };

  if (!form.company_name) {
    return {
      form,
      error: 'Company name is required.',
    };
  }

  for (const [field, limit] of Object.entries(limits)) {
    if (form[field].length > limit) {
      return {
        form,
        error: `${field} can have at most ${limit} characters.`,
      };
    }
  }

  if (
    form.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  ) {
    return {
      form,
      error: 'Please enter a valid email address.',
    };
  }

  return { form };
}

// ==========================================
// Catalog Form Validation
// ==========================================

function readCatalogForm(body) {
  const price = parseAmount(body.unitPrice);
  const capacity = parseAmount(body.capacity);
  const rate = parseAmount(body.deliveryRateKm);

  const isValid = [price, capacity, rate].every(
    (num) => num !== null && num <= MAX_AMOUNT,
  );

  if (!isValid) {
    return {
      error: `Price, capacity and delivery rate must be numbers from 0 to ${MAX_AMOUNT}.`,
    };
  }

  return {
    value: {
      price,
      capacity,
      rate,
    },
  };
}

// ==========================================
// Supplier List
// GET /suppliers
// ==========================================

router.get('/', async (req, res) => {
  const status = STATUSES.includes(req.query.status)
    ? req.query.status
    : STATUS_ACTIVE;

  const q = cleanText(req.query.q);
  const materialId = parseId(req.query.material);

  const conditions = ['s.org_id = ?'];
  const params = [req.user.org_id];

  if (q) {
    conditions.push('s.company_name LIKE ?');
    params.push(`%${q}%`);
  }

  if (status !== STATUS_ALL) {
    conditions.push('s.status = ?');
    params.push(status);
  }

  if (materialId) {
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM supplier_catalogs f
        WHERE f.supplier_id = s.id
        AND f.material_id = ?
      )`,
    );
    params.push(materialId);
  }

  const [suppliers, materials] = await Promise.all([
    query(
      `SELECT
         s.id,
         s.company_name,
         s.license_no,
         s.phone,
         s.email,
         s.status,
         COUNT(c.id) AS catalog_cnt
       FROM suppliers s
       LEFT JOIN supplier_catalogs c
         ON c.supplier_id = s.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY s.id
       ORDER BY s.company_name`,
      params,
    ),
    listMaterials(),
  ]);

  const materialOptions = materials.map((mat) => ({
    ...mat,
    isSelected: mat.id === materialId,
  }));

  res.page('suppliers/list', {
    title: 'Suppliers',
    suppliers,
    materials: materialOptions,
    q,
    status,
    materialId,
  });
});

// ==========================================
// Create Supplier Form
// GET /suppliers/new
// ==========================================

router.get('/new', (req, res) => {
  res.page('suppliers/form', {
    title: 'New supplier',
    form: {},
    action: '/suppliers',
  });
});

// ==========================================
// Create Supplier
// POST /suppliers
// ==========================================

router.post('/', async (req, res) => {
  const { form, error } = readSupplierForm(req.body);

  const fail = (message) =>
    res.status(400).page('suppliers/form', {
      title: 'New supplier',
      form,
      action: '/suppliers',
      error: message,
    });

  if (error) return fail(error);

  try {
    const rows = await query(
      `INSERT INTO suppliers (
         org_id,
         company_name,
         license_no,
         trade_name,
         phone,
         email,
         address,
         description
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.org_id,
        form.company_name,
        form.license_no || null,
        form.trade_name || null,
        form.phone || null,
        form.email || null,
        form.address || null,
        form.description || null,
      ],
    );

    res.flash('Supplier added.');
    res.redirect(`/suppliers/${rows.insertId}`);

  } catch (err) {
    if (err.code === DUPLICATE_KEY_CODE) {
      return fail('A supplier with this name already exists.');
    }

    throw err;
  }
});

// ==========================================
// Supplier Details
// GET /suppliers/:id
// ==========================================

router.get('/:id', async (req, res) => {
  const supplier = await findSupplier(
    parseId(req.params.id),
    req.user.org_id,
  );

  if (!supplier) return notFound(res);

  const [catalog, materials] = await Promise.all([
    listCatalog(supplier.id),
    listMaterials(),
  ]);

  res.page('suppliers/show', {
    title: supplier.company_name,
    supplier,
    catalog,
    materials,
  });
});

// ==========================================
// Edit Supplier Form
// GET /suppliers/:id/edit
// ==========================================

router.get('/:id/edit', async (req, res) => {
  const supplier = await findSupplier(
    parseId(req.params.id),
    req.user.org_id,
  );

  if (!supplier) return notFound(res);

  res.page('suppliers/form', {
    title: 'Edit supplier',
    form: supplier,
    action: `/suppliers/${supplier.id}`,
    isEdit: true,
  });
});

// ==========================================
// Update Supplier
// POST /suppliers/:id
// ==========================================

router.post('/:id', async (req, res) => {
  const supplier = await findSupplier(
    parseId(req.params.id),
    req.user.org_id,
  );

  if (!supplier) return notFound(res);

  const { form, error } = readSupplierForm(req.body);

  const fail = (message) =>
    res.status(400).page('suppliers/form', {
      title: 'Edit supplier',
      form,
      action: `/suppliers/${supplier.id}`,
      isEdit: true,
      error: message,
    });

  if (error) return fail(error);

  try {
    await query(
      `UPDATE suppliers SET
         company_name = ?,
         license_no = ?,
         trade_name = ?,
         phone = ?,
         email = ?,
         address = ?,
         description = ?
       WHERE id = ? AND org_id = ?`,
      [
        form.company_name,
        form.license_no || null,
        form.trade_name || null,
        form.phone || null,
        form.email || null,
        form.address || null,
        form.description || null,
        supplier.id,
        req.user.org_id,
      ],
    );

    res.flash('Supplier saved.');
    res.redirect(`/suppliers/${supplier.id}`);

  } catch (err) {
    if (err.code === DUPLICATE_KEY_CODE) {
      return fail('A supplier with this name already exists.');
    }

    throw err;
  }
});

// ==========================================
// Activate / Deactivate Supplier
// ==========================================

function setStatus(status) {
  return async (req, res) => {
    const supplier = await findSupplier(
      parseId(req.params.id),
      req.user.org_id,
    );

    if (!supplier) return notFound(res);

    await query(
      'UPDATE suppliers SET status = ? WHERE id = ? AND org_id = ?',
      [status, supplier.id, req.user.org_id],
    );

    res.render(SUPPLIER_ROW_VIEW, {
      ...supplier,
      status,
      layout: false,
    });
  };
}

router.post('/:id/deactivate', setStatus(STATUS_INACTIVE));
router.post('/:id/reactivate', setStatus(STATUS_ACTIVE));

// ==========================================
// Add Material to Supplier Catalog
// POST /suppliers/:id/catalog
// ==========================================

router.post('/:id/catalog', async (req, res) => {
  const supplier = await findSupplier(
    parseId(req.params.id),
    req.user.org_id,
  );

  if (!supplier) return notFound(res);

  const materialId = parseId(req.body.materialId);
  const { value, error } = readCatalogForm(req.body);

  const back = () => res.redirect(`/suppliers/${supplier.id}`);

  if (!materialId) {
    res.flash('Pick a material.');
    return back();
  }

  if (error) {
    res.flash(error);
    return back();
  }

  try {
    await query(
      `INSERT INTO supplier_catalogs (
         supplier_id,
         material_id,
         unit_price,
         capacity,
         delivery_rate_km
       )
       VALUES (?, ?, ?, ?, ?)`,
      [
        supplier.id,
        materialId,
        value.price,
        value.capacity,
        value.rate,
      ],
    );

    res.flash('Material added to the catalog.');

  } catch (err) {
    if (err.code === DUPLICATE_KEY_CODE) {
      res.flash(
        'This supplier already sells that material. Edit the existing row instead.',
      );
    } else if (err.code === MISSING_PARENT_CODE) {
      res.flash('That material does not exist.');
    } else {
      throw err;
    }
  }

  return back();
});

// ==========================================
// Update Catalog Item
// POST /suppliers/:id/catalog/:catalogId
// ==========================================

router.post('/:id/catalog/:catalogId', async (req, res) => {
  const supplier = await findSupplier(
    parseId(req.params.id),
    req.user.org_id,
  );

  if (!supplier) return notFound(res);

  const catalogId = parseId(req.params.catalogId);

  const row = await findCatalogRow(
    catalogId,
    supplier.id,
  );

  if (!row) {
    return res.status(404).send('Catalog row not found.');
  }

  const { value, error } = readCatalogForm(req.body);

  if (error) {
    return res.render(CATALOG_ROW_VIEW, {
      ...row,
      error,
      layout: false,
    });
  }

  await query(
    `UPDATE supplier_catalogs
     SET
       unit_price = ?,
       capacity = ?,
       delivery_rate_km = ?
     WHERE id = ? AND supplier_id = ?`,
    [
      value.price,
      value.capacity,
      value.rate,
      row.id,
      supplier.id,
    ],
  );

  const saved = await findCatalogRow(
    row.id,
    supplier.id,
  );

  res.render(CATALOG_ROW_VIEW, {
    ...saved,
    saved: true,
    layout: false,
  });
});

// ==========================================
// Delete Catalog Item
// POST /suppliers/:id/catalog/:catalogId/delete
// ==========================================

router.post('/:id/catalog/:catalogId/delete', async (req, res) => {
  const supplier = await findSupplier(
    parseId(req.params.id),
    req.user.org_id,
  );

  if (!supplier) return notFound(res);

  const row = await findCatalogRow(
    parseId(req.params.catalogId),
    supplier.id,
  );

  if (!row) {
    return res.status(404).send('Catalog row not found.');
  }

  try {
    await query(
      `DELETE FROM supplier_catalogs
       WHERE id = ? AND supplier_id = ?`,
      [row.id, supplier.id],
    );

  } catch (err) {
    if (err.code !== REFERENCED_CODE) throw err;

    const error =
      'This catalog row has orders, so it cannot be deleted.';

    return res.render(CATALOG_ROW_VIEW, {
      ...row,
      error,
      layout: false,
    });
  }

  res.send('');
});

module.exports = router;
