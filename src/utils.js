import axios from "axios";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Paginated fetch helper that handles limit/offset pagination.
 * Stops when items.length < limit or offset >= total_count.
 * Returns { items, wasClipped } where wasClipped indicates if data was truncated.
 *
 * @param {string} url - The API endpoint URL
 * @param {object} params - Query parameters (limit will be set automatically)
 * @param {string} itemsKey - The key in response.data containing the items array
 * @param {number} limit - Page size (default 1000)
 * @returns {Promise<{items: Array, wasClipped: boolean}>}
 */
export const paginatedFetch = async (url, params, itemsKey, limit = 1000) => {
  let items = [];
  let offset = 0;
  let wasClipped = false;

  while (true) {
    const response = await axios.get(url, {
      params: {
        ...params,
        limit,
        offset,
      },
    });

    const pageItems = response.data[itemsKey] || [];
    items = [...items, ...pageItems];

    // Track if data was clipped
    if (response.data.is_total_count_clipped) {
      wasClipped = true;
    }

    // Break if we got fewer than the limit (last page) or offset exceeds total
    if (pageItems.length < limit || offset + pageItems.length >= (response.data.total_count || 0)) {
      break;
    }

    offset += pageItems.length;
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
