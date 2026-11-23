const QUOTE = '"';
const COMMA = ',';
const NEWLINE = '\n';
const RETURN = '\r';

/**
 * Parses CSV text into rows of string cells.
 * Handles quoted fields, escaped quotes, and commas or newlines inside quotes.
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let isQuoted = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let idx = 0; idx < text.length; idx += 1) {
    const char = text[idx];
    if (isQuoted) {
      if (char !== QUOTE) cell += char;
      else if (text[idx + 1] === QUOTE) {
        cell += QUOTE;
        idx += 1;
      } else isQuoted = false;
    } else if (char === QUOTE) isQuoted = true;
    else if (char === COMMA) endCell();
    else if (char === NEWLINE) endRow();
    else if (char !== RETURN) cell += char;
  }
  if (cell !== '' || row.length > 0) endRow();

  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

module.exports = { parseCsv };
