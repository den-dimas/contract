const PRICE_WEIGHT = 0.7;
const RATING_WEIGHT = 0.3;
const NEUTRAL_RATING = 3;
const MAX_RATING = 5;
const SCORE_DIGITS = 4;

const SORT_RANK = 'rank';
const SORT_PRICE = 'price';
const SORT_DISTANCE = 'distance';
const SORT_RATING = 'rating';
const SORT_KEYS = [SORT_RANK, SORT_PRICE, SORT_DISTANCE, SORT_RATING];

/**
 * Picks the rating used for ranking. Unrated suppliers get the neutral rating.
 * @param {number|null} avgScore
 */
function ratingOf(avgScore) {
  return avgScore === null || avgScore === undefined ? NEUTRAL_RATING : Number(avgScore);
}

/**
 * Adds rankScore to each offer and sorts best first.
 * @param {Array<{landedCost: number, avgScore: number|null}>} offers
 */
function rankOffers(offers) {
  if (offers.length === 0) return [];
  const cheapest = Math.min(...offers.map((offer) => offer.landedCost));
  return offers
    .map((offer) => {
      const priceRatio = offer.landedCost > 0 ? cheapest / offer.landedCost : 1;
      const raw = PRICE_WEIGHT * priceRatio + RATING_WEIGHT * (ratingOf(offer.avgScore) / MAX_RATING);
      return { ...offer, rankScore: Number(raw.toFixed(SCORE_DIGITS)) };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

const sortByPrice = (offers) => [...offers].sort((a, b) => a.landedCost - b.landedCost);
const sortByDistance = (offers) => [...offers].sort((a, b) => a.distanceKm - b.distanceKm);
const sortByRating = (offers) => [...offers].sort((a, b) => ratingOf(b.avgScore) - ratingOf(a.avgScore));
const sortByRank = (offers) => [...offers].sort((a, b) => b.rankScore - a.rankScore);

const SORTERS = {
  [SORT_RANK]: sortByRank,
  [SORT_PRICE]: sortByPrice,
  [SORT_DISTANCE]: sortByDistance,
  [SORT_RATING]: sortByRating,
};

/**
 * Sorts ranked offers by a sort key. Unknown keys fall back to rank.
 * @param {Array} offers
 * @param {string} key One of rank, price, distance, rating.
 */
function sortOffers(offers, key) {
  return (SORTERS[key] ?? sortByRank)(offers);
}

module.exports = {
  PRICE_WEIGHT,
  RATING_WEIGHT,
  NEUTRAL_RATING,
  SORT_KEYS,
  SORT_RANK,
  rankOffers,
  sortOffers,
  sortByPrice,
  sortByDistance,
  sortByRating,
};
