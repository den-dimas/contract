const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/lib/password');

test('verifyPassword accepts the right password', async () => {
  const stored = await hashPassword('secret123');
  assert.equal(await verifyPassword('secret123', stored), true);
});

test('verifyPassword rejects a wrong password', async () => {
  const stored = await hashPassword('secret123');
  assert.equal(await verifyPassword('secret124', stored), false);
});

test('hashPassword gives a different hash each time', async () => {
  assert.notEqual(await hashPassword('same'), await hashPassword('same'));
});
