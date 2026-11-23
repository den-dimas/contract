const MONEY_DIGITS = 2;

module.exports = {
  eq: (a, b) => String(a) === String(b),
  money: (value) => Number(value).toLocaleString('en-US', {
    minimumFractionDigits: MONEY_DIGITS,
    maximumFractionDigits: MONEY_DIGITS,
  }),
  percent: (value) => `${(Number(value) * 100).toFixed(1)}%`,
  stars: (value) => (value === null || value === undefined ? 'No ratings' : Number(value).toFixed(1)),
};
