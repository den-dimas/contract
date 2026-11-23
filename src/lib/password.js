const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Hashes a password with a random salt.
 * @param {string} password
 * @returns {Promise<string>} "salt:hash" in hex.
 */
async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const key = await scryptAsync(password, salt, KEY_BYTES);
  return `${salt}:${key.toString('hex')}`;
}

/**
 * Checks a password against a stored "salt:hash" value.
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const key = await scryptAsync(password, salt, KEY_BYTES);
  return timingSafeEqual(key, Buffer.from(hash, 'hex'));
}

module.exports = { hashPassword, verifyPassword };
