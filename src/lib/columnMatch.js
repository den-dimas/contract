const NOT_FOUND = -1;
const NON_ALPHANUMERIC = /[^a-z0-9]/g;

const FIELDS = [
  { key: 'companyName', label: 'Company name', aliases: ['companyname', 'company', 'supplier', 'suppliername', 'vendor', 'vendorname', 'name'] },
  { key: 'licenseNo', label: 'License number', aliases: ['licenseno', 'licensenumber', 'license', 'licence', 'licenceno'] },
  { key: 'material', label: 'Material', aliases: ['material', 'materialname', 'product', 'item', 'description'] },
  { key: 'unitPrice', label: 'Unit price', aliases: ['unitprice', 'price', 'cost', 'unitcost', 'priceperunit'] },
  { key: 'capacity', label: 'Capacity', aliases: ['capacity', 'supplycapacity', 'maxquantity', 'stock', 'quantity'] },
  { key: 'deliveryRateKm', label: 'Delivery rate per km', aliases: ['deliveryratekm', 'deliveryrate', 'deliverycost', 'deliveryperkm', 'freight', 'ratekm', 'perkm'] },
];

/**
 * Lowercases a header and removes everything except letters and digits.
 * @param {string} text
 */
function normalize(text) {
  return String(text).toLowerCase().replace(NON_ALPHANUMERIC, '');
}

function findIndex(normalized, field, taken, isExact) {
  return normalized.findIndex((header, idx) => {
    if (header === '' || taken.has(idx)) return false;
    return field.aliases.some((alias) => (isExact ? header === alias : header.includes(alias)));
  });
}

/**
 * Suggests which header column feeds each field.
 * Exact alias matches win over partial ones. Each header is used once.
 * @param {string[]} headers
 * @returns {Object<string, number>} Field key to header index, or -1.
 */
function suggestMapping(headers) {
  const normalized = headers.map(normalize);
  const taken = new Set();
  const mapping = Object.fromEntries(FIELDS.map((field) => [field.key, NOT_FOUND]));

  [true, false].forEach((isExact) => {
    FIELDS.forEach((field) => {
      if (mapping[field.key] !== NOT_FOUND) return;
      const idx = findIndex(normalized, field, taken, isExact);
      if (idx === NOT_FOUND) return;
      mapping[field.key] = idx;
      taken.add(idx);
    });
  });
  return mapping;
}

module.exports = { FIELDS, NOT_FOUND, suggestMapping };
