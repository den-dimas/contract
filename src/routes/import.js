const express = require('express');
const { withTransaction } = require('../db');
const { parseCsv } = require('../lib/csv');
const { FIELDS, NOT_FOUND, suggestMapping } = require('../lib/columnMatch');
const { readRow } = require('../lib/importRow');

const SAMPLE_ROWS = 5;
const HEADER_ROWS = 1;
const FIRST_DATA_ROW_NUMBER = 2;
const MAPPING_PREFIX = 'map_';

const router = express.Router();

function buildMapping(body, headerCnt) {
  return Object.fromEntries(FIELDS.map((field) => {
    const raw = body[`${MAPPING_PREFIX}${field.key}`];
    const idx = raw === undefined || raw === '' ? NaN : Number(raw);
    const isValid = Number.isInteger(idx) && idx >= 0 && idx < headerCnt;
    return [field.key, isValid ? idx : NOT_FOUND];
  }));
}

function buildPreview(csv, rows, mapping, error) {
  const headers = rows[0];
  const fields = FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    isRequired: field.key === 'companyName',
    options: headers.map((name, idx) => ({ idx, name, isSelected: mapping[field.key] === idx })),
  }));
  return {
    title: 'Import suppliers',
    csv,
    headers,
    samples: rows.slice(HEADER_ROWS, HEADER_ROWS + SAMPLE_ROWS),
    fields,
    prefix: MAPPING_PREFIX,
    error,
  };
}

function readCsvBody(req) {
  const csv = typeof req.body.csv === 'string' ? req.body.csv : '';
  return { csv, rows: parseCsv(csv) };
}

function isUsable(rows) {
  return rows.length > HEADER_ROWS;
}

async function importRow(conn, orgId, value) {
  let materialId = null;
  if (value.material) {
    const [found] = await conn.execute(
      'SELECT id FROM master_materials WHERE LOWER(standard_name) = LOWER(?)',
      [value.material],
    );
    if (found.length === 0) return `Material "${value.material}" is not in the master list.`;
    materialId = found[0].id;
  }
  const [supplier] = await conn.execute(
    `INSERT INTO suppliers (org_id, company_name, license_no) VALUES (?, ?, ?) AS new
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), license_no = COALESCE(new.license_no, suppliers.license_no)`,
    [orgId, value.companyName, value.licenseNo || null],
  );
  if (materialId === null) return null;
  await conn.execute(
    `INSERT INTO supplier_catalogs (supplier_id, material_id, unit_price, capacity, delivery_rate_km)
     VALUES (?, ?, ?, ?, ?) AS new
     ON DUPLICATE KEY UPDATE unit_price = new.unit_price, capacity = new.capacity, delivery_rate_km = new.delivery_rate_km`,
    [supplier.insertId, materialId, value.unitPrice, value.capacity, value.deliveryRateKm],
  );
  return null;
}

router.get('/', (req, res) => res.page('import/upload', { title: 'Import suppliers' }));

router.post('/preview', (req, res) => {
  const { csv, rows } = readCsvBody(req);
  if (!isUsable(rows)) {
    return res.status(400).page('import/upload', {
      title: 'Import suppliers', csv, error: 'The spreadsheet needs a header row and at least one data row.',
    });
  }
  res.page('import/preview', buildPreview(csv, rows, suggestMapping(rows[0])));
});

router.post('/', async (req, res) => {
  const { csv, rows } = readCsvBody(req);
  if (!isUsable(rows)) {
    return res.status(400).page('import/upload', {
      title: 'Import suppliers', csv, error: 'The spreadsheet needs a header row and at least one data row.',
    });
  }
  const mapping = buildMapping(req.body, rows[0].length);
  if (mapping.companyName === NOT_FOUND) {
    return res.status(400).page('import/preview', buildPreview(csv, rows, mapping, 'Choose a column for company name.'));
  }

  const failures = [];
  const imported = await withTransaction(async (conn) => {
    let cnt = 0;
    for (const [idx, cells] of rows.slice(HEADER_ROWS).entries()) {
      const rowNumber = idx + FIRST_DATA_ROW_NUMBER;
      const { value, error } = readRow(cells, mapping);
      const reason = error ?? await importRow(conn, req.user.org_id, value);
      if (reason) failures.push({ rowNumber, reason });
      else cnt += 1;
    }
    return cnt;
  });
  res.page('import/result', { title: 'Import result', imported, failures, hasFailures: failures.length > 0 });
});

module.exports = router;
