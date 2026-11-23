/**
 * Reads a form value as a non negative number.
 * @param {*} value
 * @returns {number|null} The number, or null when it is blank or invalid.
 */
function parseAmount(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/**
 * Reads a form value as a positive whole id.
 * @param {*} value
 * @returns {number|null}
 */
function parseId(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/**
 * Trims a form value to a string. Blank becomes an empty string.
 * @param {*} value
 */
function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

module.exports = { parseAmount, parseId, cleanText };
