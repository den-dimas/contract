const CENTS = 100;

/**
 * Rounds a number to 2 decimals.
 * @param {number} value
 */
function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * CENTS) / CENTS;
}

/**
 * Splits the landed cost into material, delivery, tax and total.
 * @param {{unitPrice: number, quantity: number, distanceKm: number, deliveryRateKm: number, taxRate: number}} input
 * @returns {{material: number, delivery: number, tax: number, total: number}}
 */
function breakdown({ unitPrice, quantity, distanceKm, deliveryRateKm, taxRate }) {
  const material = unitPrice * quantity;
  const delivery = distanceKm * deliveryRateKm;
  const subtotal = material + delivery;
  return {
    material: roundMoney(material),
    delivery: roundMoney(delivery),
    tax: roundMoney(subtotal * taxRate),
    total: roundMoney(subtotal * (1 + taxRate)),
  };
}

/**
 * Computes the total landed cost: (price * qty + distance * rate) * (1 + tax).
 * @param {{unitPrice: number, quantity: number, distanceKm: number, deliveryRateKm: number, taxRate: number}} input
 * @returns {number} Total rounded to 2 decimals.
 */
function landedCost(input) {
  return breakdown(input).total;
}

module.exports = { landedCost, breakdown, roundMoney };
