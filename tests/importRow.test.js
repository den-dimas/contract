const test = require('node:test');
const assert = require('node:assert/strict');
const { readRow } = require('../src/lib/importRow');

const mapping = { companyName: 0, licenseNo: 1, material: 2, unitPrice: 3, capacity: 4, deliveryRateKm: 5 };

test('reads a full row', () => {
  const result = readRow([' Acme ', 'L1', 'Cement', '10.5', '100', '2'], mapping);
  assert.deepEqual(result.value, {
    companyName: 'Acme', licenseNo: 'L1', material: 'Cement', unitPrice: 10.5, capacity: 100, deliveryRateKm: 2,
  });
});

test('supplier only row skips the numbers', () => {
  const result = readRow(['Acme', '', '', '', '', ''], mapping);
  assert.deepEqual(result.value, { companyName: 'Acme', licenseNo: '', material: '' });
});

test('empty company name is an error', () => {
  assert.ok(readRow(['', '', 'Cement', '1', '1', '1'], mapping).error);
});

test('material with a bad number is an error', () => {
  assert.match(readRow(['Acme', '', 'Cement', 'abc', '1', '1'], mapping).error, /Unit price/);
  assert.match(readRow(['Acme', '', 'Cement', '1', '-5', '1'], mapping).error, /Capacity/);
  assert.match(readRow(['Acme', '', 'Cement', '1', '1', ''], mapping).error, /Delivery/);
});

test('unmapped columns read as empty', () => {
  const result = readRow(['Acme'], { companyName: 0, licenseNo: -1, material: -1 });
  assert.deepEqual(result.value, { companyName: 'Acme', licenseNo: '', material: '' });
});

test('too large number and too long name are errors', () => {
  assert.ok(readRow(['Acme', '', 'Cement', '1e12', '1', '1'], mapping).error);
  assert.ok(readRow(['x'.repeat(121), '', '', '', '', ''], mapping).error);
});
