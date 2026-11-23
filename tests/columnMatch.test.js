const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestMapping, NOT_FOUND } = require('../src/lib/columnMatch');

test('maps common headers', () => {
  const headers = ['Supplier Name', 'License No.', 'Material', 'Unit Price', 'Capacity', 'Delivery Rate / km'];
  assert.deepEqual(suggestMapping(headers), {
    companyName: 0, licenseNo: 1, material: 2, unitPrice: 3, capacity: 4, deliveryRateKm: 5,
  });
});

test('uses contains match when no exact alias', () => {
  const mapping = suggestMapping(['Company Legal Title', 'Price (USD)']);
  assert.equal(mapping.companyName, 0);
  assert.equal(mapping.unitPrice, 1);
});

test('exact match beats contains match', () => {
  const mapping = suggestMapping(['Unit Price Notes', 'Price']);
  assert.equal(mapping.unitPrice, 1);
});

test('uses each header once', () => {
  const mapping = suggestMapping(['Company']);
  const used = Object.values(mapping).filter((idx) => idx !== NOT_FOUND);
  assert.deepEqual(used, [0]);
});

test('unknown headers give -1', () => {
  const mapping = suggestMapping(['Foo']);
  assert.equal(mapping.companyName, NOT_FOUND);
});
