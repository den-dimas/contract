const { query } = require('../db');

/**
 * Finds a project only when it belongs to the organization.
 * @param {number|null} id
 * @param {number} orgId
 * @returns {Promise<object|null>}
 */
async function findProject(id, orgId) {
  if (!id) return null;
  const rows = await query(
    'SELECT id, name, location, tax_rate FROM projects WHERE id = ? AND org_id = ?',
    [id, orgId],
  );
  return rows[0] ?? null;
}

/**
 * Finds an order of a project with its supplier, material and rating.
 * @param {number|null} projectId
 * @param {number|null} orderId
 * @returns {Promise<object|null>}
 */
async function findOrder(projectId, orderId) {
  if (!orderId) return null;
  const rows = await query(
    `SELECT o.id, o.project_id, o.quantity, o.total_landed_cost, o.status, o.version_id,
            s.company_name AS supplier, m.standard_name AS material,
            r.id AS rating_id, r.punctuality_score, r.quantity_score, r.comment
     FROM orders o
     JOIN suppliers s ON s.id = o.supplier_id
     JOIN supplier_catalogs c ON c.id = o.catalog_id
     JOIN master_materials m ON m.id = c.material_id
     LEFT JOIN ratings r ON r.order_id = o.id
     WHERE o.id = ? AND o.project_id = ?`,
    [orderId, projectId],
  );
  return rows[0] ?? null;
}

module.exports = { findProject, findOrder };
