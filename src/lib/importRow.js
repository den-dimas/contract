const { parseAmount, cleanText } = require('./parse');
const { NOT_FOUND } = require('./columnMatch');

const MAX_AMOUNT = 99999999;
const MAX_NAME_LENGTH = 120;
const MAX_LICENSE_LENGTH = 40;

const NUMBER_FIELDS = [
  { key: 'unitPrice', label: 'Unit price' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'deliveryRateKm', label: 'Delivery rate per km' },
];

function pick(cells, mapping, key) {
  const idx = mapping[key];
  if (idx === undefined || idx === NOT_FOUND) return '';
  return cleanText(cells[idx] ?? '');
}

/**
 * Turns one CSV row into a supplier and an optional catalog entry.
 * @param {string[]} cells
 * @param {Object<string, number>} mapping Field key to column index.
 * @returns {{value: {companyName: string, licenseNo: string, material: string, unitPrice?: number, capacity?: number, deliveryRateKm?: number}}|{error: string}}
 */
function readRow(cells, mapping) {
  const companyName = pick(cells, mapping, 'companyName');
  if (!companyName) return { error: 'Company name is empty.' };

  const value = {
    companyName,
    licenseNo: pick(cells, mapping, 'licenseNo'),
    material: pick(cells, mapping, 'material'),
  };
  if (companyName.length > MAX_NAME_LENGTH) return { error: `Company name is longer than ${MAX_NAME_LENGTH} characters.` };
  if (value.licenseNo.length > MAX_LICENSE_LENGTH) return { error: `License number is longer than ${MAX_LICENSE_LENGTH} characters.` };
  if (!value.material) return { value };

  for (const field of NUMBER_FIELDS) {
    const num = parseAmount(pick(cells, mapping, field.key));
    if (num === null || num > MAX_AMOUNT) {
      return { error: `${field.label} must be a number from 0 to ${MAX_AMOUNT}.` };
    }
    value[field.key] = num;
  }
  return { value };
}

module.exports = { readRow, MAX_AMOUNT, MAX_NAME_LENGTH, MAX_LICENSE_LENGTH };
