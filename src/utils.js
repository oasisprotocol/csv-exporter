import axios from "axios";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with retry logic.
 * @param {function} fetchFn - Async function to execute
 * @param {number} maxRetries - Maximum number of retries (default 3)
 * @param {number} baseDelay - Base delay in ms for exponential backoff (default 1000)
 * @returns {Promise<*>} - Result of the fetch function
 */
const fetchWithRetry = async (fetchFn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  throw lastError;
};

/**
 * Paginated fetch helper that handles limit/offset pagination.
 * Stops when items.length < limit or offset >= total_count.
 * Returns { items, wasClipped } where wasClipped indicates if data was truncated.
 *
 * @param {string} url - The API endpoint URL
 * @param {object} params - Query parameters (limit will be set automatically)
 * @param {string} itemsKey - The key in response.data containing the items array
 * @param {number} limit - Page size (default 1000)
 * @param {function} onProgress - Optional callback for progress updates (called with items count)
 * @returns {Promise<{items: Array, wasClipped: boolean}>}
 */
export const paginatedFetch = async (url, params, itemsKey, limit = 1000, onProgress = null) => {
  let items = [];
  let offset = 0;
  let wasClipped = false;
  let pageNum = 1;

  while (true) {
    const currentOffset = offset;
    const response = await fetchWithRetry(() =>
      axios.get(url, {
        params: {
          ...params,
          limit,
          offset: currentOffset,
        },
      })
    );

    const pageItems = response.data[itemsKey] || [];
    items = [...items, ...pageItems];

    // Track if data was clipped
    if (response.data.is_total_count_clipped) {
      wasClipped = true;
    }

    // Report progress if callback provided
    if (onProgress) {
      onProgress(items.length, pageNum);
    }

    // Break if we got fewer than the limit (last page)
    // Note: When is_total_count_clipped is true, total_count is capped (often at 1000),
    // so we can't rely on offset >= total_count to know we're done.
    // Instead, we only stop when we get fewer items than requested.
    if (pageItems.length < limit) {
      break;
    }

    offset += pageItems.length;
    pageNum++;
    await sleep(100);
  }

  return { items, wasClipped };
};

/**
 * Normalize an address to lowercase for consistent comparison.
 * Returns empty string for null/undefined.
 *
 * @param {string|null|undefined} address
 * @returns {string}
 */
export const normalizeAddress = (address) => {
  return address?.toLowerCase() || "";
};

/**
 * Normalize all addresses in a Set to lowercase.
 *
 * @param {string[]} addresses
 * @returns {Set<string>}
 */
export const createAddressSet = (addresses) => {
  return new Set(addresses.map((addr) => normalizeAddress(addr)));
};

/**
 * Base64 to hex conversion.
 *
 * @param {string} b64
 * @returns {string}
 */
export const b64ToHex = (b64) => {
  if (!b64) return "";
  try {
    const binaryStr = atob(b64);
    return Array.from(binaryStr)
      .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "";
  }
};

/**
 * Safely get nested property value with optional chaining.
 *
 * @param {object} obj
 * @param {string} path - Dot-separated path like "body.amount.Amount"
 * @param {*} defaultValue
 * @returns {*}
 */
export const safeGet = (obj, path, defaultValue = undefined) => {
  return path.split(".").reduce((acc, part) => acc?.[part], obj) ?? defaultValue;
};

// GitHub raw URL for ROSE/USD price data
const ROSE_PRICES_URL =
  "https://raw.githubusercontent.com/oasisprotocol/csv-exporter/master/src/prices/rose-usd.json";

// Cached price data
let rosePricesCache = null;

/**
 * Fetch ROSE/USD price data from GitHub (cached).
 * @param {function} [onWarning] - Optional callback for warning messages
 * @returns {Promise<object>} - Object mapping dates to USD prices
 */
export const fetchRosePrices = async (onWarning) => {
  if (rosePricesCache) {
    return rosePricesCache;
  }

  try {
    const response = await axios.get(ROSE_PRICES_URL);
    rosePricesCache = response.data;
    return rosePricesCache;
  } catch (error) {
    const message = `Failed to fetch ROSE prices: ${error.message}. USD values will not be available.`;
    console.error(message);
    if (onWarning) {
      onWarning(message);
    }
    return {};
  }
};

/**
 * Get the USD price for ROSE on a given date.
 * Falls back to previous days if the exact date is not available.
 * @param {object} prices - Price data object from fetchRosePrices()
 * @param {string} timestamp - ISO timestamp
 * @param {number} maxDaysBack - Maximum days to look back (default 7)
 * @returns {number|null} - USD price or null if not available
 */
export const getRosePrice = (prices, timestamp, maxDaysBack = 7) => {
  if (!timestamp || !prices) return null;
  const date = new Date(timestamp.split("T")[0]);

  for (let i = 0; i <= maxDaysBack; i++) {
    const checkDate = new Date(date);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split("T")[0];
    if (prices[dateStr] !== undefined) {
      return prices[dateStr];
    }
  }

  return null;
};
