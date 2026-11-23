const test = require('node:test');
const assert = require('node:assert/strict');
const { landedCost, breakdown } = require('../src/lib/landedCost');

const base = { unitPrice: 100, quantity: 10, distanceKm: 20, deliveryRateKm: 5, taxRate: 0.05 };

test('landedCost applies tax to material plus delivery', () => {
  assert.equal(landedCost(base), 1155);
});

test('landedCost with zero distance has no delivery', () => {
  assert.equal(landedCost({ ...base, distanceKm: 0 }), 1050);
});

test('landedCost rounds to 2 decimals', () => {
  assert.equal(landedCost({ unitPrice: 3.333, quantity: 3, distanceKm: 0, deliveryRateKm: 0, taxRate: 0.05 }), 10.5);
});

test('breakdown lists material, delivery, tax and total', () => {
  assert.deepEqual(breakdown(base), { material: 1000, delivery: 100, tax: 55, total: 1155 });
});

test('landedCost with zero tax equals subtotal', () => {
  assert.equal(landedCost({ ...base, taxRate: 0 }), 1100);
});
