const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAmount, parseId, cleanText } = require('../src/lib/parse');

test('parseAmount reads valid numbers', () => {
  assert.equal(parseAmount('12.5'), 12.5);
  assert.equal(parseAmount('0'), 0);
});

test('parseAmount returns null for blank, negative or bad input', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount(undefined), null);
  assert.equal(parseAmount('-1'), null);
  assert.equal(parseAmount('abc'), null);
});

test('parseId accepts only positive whole numbers', () => {
  assert.equal(parseId('7'), 7);
  assert.equal(parseId('0'), null);
  assert.equal(parseId('1.5'), null);
  assert.equal(parseId('x'), null);
});

test('cleanText trims strings and blanks non strings', () => {
  assert.equal(cleanText('  hi '), 'hi');
  assert.equal(cleanText(undefined), '');
});
