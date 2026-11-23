const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv } = require('../src/lib/csv');

test('parses plain rows', () => {
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
});

test('handles CRLF and blank trailing lines', () => {
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n\r\n\r\n'), [['a', 'b'], ['1', '2']]);
});

test('handles quoted commas, newlines and escaped quotes', () => {
  const text = '"Acme, Inc","line1\nline2","say ""hi"""\n';
  assert.deepEqual(parseCsv(text), [['Acme, Inc', 'line1\nline2', 'say "hi"']]);
});

test('keeps empty cells and a last row without newline', () => {
  assert.deepEqual(parseCsv('a,,c\n1,2,'), [['a', '', 'c'], ['1', '2', '']]);
});

test('returns no rows for empty text', () => {
  assert.deepEqual(parseCsv(''), []);
});
