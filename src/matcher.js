/**
 * Escapes special characters for regular expressions.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a specific available size string matches a target size query.
 * Handles:
 * - Exact matches (case-insensitive)
 * - Letter sizes without false substrings (e.g. 'L' matches 'L', 'L/XL', 'L (40)', but NOT 'XL', 'XXL')
 * - Descriptive/children sizes (e.g. '104' matches '104 (3-4 lata)')
 * - Numbered/decimal sizes (e.g. '38' matches '38' but not '38.5' or '138', and '38,5' matches '38.5')
 *
 * @param {string} availableSize
 * @param {string} targetSize
 * @returns {boolean}
 */
export function matchesSize(availableSize, targetSize) {
  if (!availableSize || !targetSize) return false;

  const normAvailable = availableSize.trim().toLowerCase();
  const normTarget = targetSize.trim().toLowerCase();

  if (!normTarget) return false;
  if (normAvailable === normTarget) return true;

  let escaped = escapeRegex(normTarget);
  // Allow comma or dot to match each other in decimal sizes (e.g. 38,5 vs 38.5)
  escaped = escaped.replace(/\\\.|,/g, '[.,]');

  // Boundary check: target cannot be preceded by alphanumeric chars,
  // and cannot be followed by alphanumeric chars or decimal digits (e.g. 38 vs 38.5)
  const regex = new RegExp('(^|[^a-z0-9])' + escaped + '(?![a-z0-9]|(?:[.,]\\d))', 'i');
  return regex.test(normAvailable);
}

/**
 * Checks if an available size matches any size in a comma-separated query string (or array of queries).
 *
 * @param {string} availableSize
 * @param {string|string[]} targetSizes
 * @returns {boolean}
 */
export function matchesAnySize(availableSize, targetSizes) {
  if (!targetSizes) return true;

  const targets = Array.isArray(targetSizes)
    ? targetSizes
    : targetSizes.split(',').map((s) => s.trim()).filter(Boolean);

  if (targets.length === 0) return true;

  return targets.some((target) => matchesSize(availableSize, target));
}

/**
 * Filters a list of available sizes against a comma-separated query string.
 *
 * @param {string[]} availableSizes
 * @param {string} szukanyRozmiar
 * @returns {string[]}
 */
export function filterSizes(availableSizes, szukanyRozmiar) {
  if (!szukanyRozmiar || !szukanyRozmiar.trim()) {
    return availableSizes;
  }
  return availableSizes.filter((size) => matchesAnySize(size, szukanyRozmiar));
}
