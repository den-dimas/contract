const test = require('node:test');
const assert = require('node:assert/strict');
const {
  rankOffers, sortOffers, sortByPrice, sortByDistance, sortByRating, NEUTRAL_RATING,
} = require('../src/lib/ranking');

const offers = [
  { id: 'a', landedCost: 100, avgScore: 3, distanceKm: 30 },
  { id: 'b', landedCost: 200, avgScore: 5, distanceKm: 10 },
  { id: 'c', landedCost: 150, avgScore: null, distanceKm: 20 },
];
const ids = (list) => list.map((offer) => offer.id);

test('rankOffers scores the cheapest supplier with a neutral rating', () => {
  const [top] = rankOffers([{ id: 'x', landedCost: 100, avgScore: null }]);
  assert.equal(top.rankScore, Number((0.7 + 0.3 * (NEUTRAL_RATING / 5)).toFixed(4)));
});

test('rankOffers sorts by score descending', () => {
  assert.deepEqual(ids(rankOffers(offers)), ['a', 'b', 'c']);
  const scores = rankOffers(offers).map((offer) => offer.rankScore);
  assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
});

test('rankOffers lets a high rating beat a small price gap', () => {
  const ranked = rankOffers([
    { id: 'cheap', landedCost: 100, avgScore: 1 },
    { id: 'good', landedCost: 105, avgScore: 5 },
  ]);
  assert.equal(ranked[0].id, 'good');
});

test('rankOffers handles empty input and zero cost', () => {
  assert.deepEqual(rankOffers([]), []);
  assert.equal(rankOffers([{ landedCost: 0, avgScore: 5 }])[0].rankScore, 1);
});

test('rankOffers does not change the input', () => {
  const copy = JSON.parse(JSON.stringify(offers));
  rankOffers(offers);
  assert.deepEqual(offers, copy);
});

test('sortByPrice orders cheapest first', () => {
  assert.deepEqual(ids(sortByPrice(offers)), ['a', 'c', 'b']);
});

test('sortByDistance orders nearest first', () => {
  assert.deepEqual(ids(sortByDistance(offers)), ['b', 'c', 'a']);
});

test('sortByRating orders best first and treats unrated as neutral', () => {
  assert.deepEqual(ids(sortByRating(offers)), ['b', 'a', 'c']);
});

test('sortOffers picks by key and falls back to rank', () => {
  const ranked = rankOffers(offers);
  assert.deepEqual(ids(sortOffers(ranked, 'price')), ['a', 'c', 'b']);
  assert.deepEqual(ids(sortOffers(ranked, 'distance')), ['b', 'c', 'a']);
  assert.deepEqual(ids(sortOffers(ranked, 'rating')), ['b', 'a', 'c']);
  assert.deepEqual(ids(sortOffers(ranked, 'bogus')), ids(ranked));
});
