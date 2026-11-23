const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool(config.db);

/**
 * Runs a prepared statement and returns the result rows.
 * @param {string} sql Statement with ? placeholders.
 * @param {Array} [params] Values for the placeholders.
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Runs work inside one SQL transaction. Rolls back if the work throws.
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<*>} work
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, withTransaction };
