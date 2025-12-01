/**
 * Debug the history lookup issue
 */

import axios from "axios";

const NEXUS_API = "https://nexus.oasis.io/v1";
const VALIDATOR = "oasis1qq3xrq0urs8qcffhvmhfhz4p0mu7ewc8rscnlwxe";
const START_EPOCH = 28809;
const END_EPOCH = 37689;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const paginatedFetch = async (url, params, itemsKey, limit = 1000) => {
  let items = [];
  let offset = 0;

  while (true) {
    const response = await axios.get(url, {
      params: { ...params, limit, offset },
    });

    const pageItems = response.data[itemsKey] || [];
    items = [...items, ...pageItems];

    console.log(`  Page: offset=${offset}, got ${pageItems.length} items, total_count=${response.data.total_count}, clipped=${response.data.is_total_count_clipped}`);

    // Break if we got fewer than the limit (last page)
    // Note: When is_total_count_clipped is true, total_count is capped (often at 1000),
    // so we can't rely on offset >= total_count to know we're done.
    if (pageItems.length < limit) {
      break;
    }

    offset += pageItems.length;
    await sleep(100);
  }

  return { items };
};

const findHistoryEntryForEpoch = (history, targetEpoch) => {
  if (!history || history.length === 0) return null;

  let low = 0;
  let high = history.length - 1;
  let result = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (history[mid].epoch <= targetEpoch) {
      result = history[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
};

async function main() {
  console.log("=== Debug: Checking validator history fetch ===\n");

  // This is what the implementation does
  console.log(`Fetching history from epoch ${Math.max(1, START_EPOCH - 100)} to ${END_EPOCH}...`);
  const { items: history } = await paginatedFetch(
    `${NEXUS_API}/consensus/validators/${VALIDATOR}/history`,
    { from: Math.max(1, START_EPOCH - 100), to: END_EPOCH },
    "history"
  );

  console.log(`Fetched ${history.length} history entries`);

  if (history.length > 0) {
    history.sort((a, b) => a.epoch - b.epoch);
    console.log(`First epoch: ${history[0].epoch}`);
    console.log(`Last epoch: ${history[history.length - 1].epoch}`);
  }

  // Check what epochs we can find
  const epochsToCheck = [28809, 29549, 30289, 31029, 31769, 32509, 33249, 33989, 34729, 35469, 36209, 36949, 37689];

  console.log("\nChecking findHistoryEntryForEpoch for each monthly epoch:");
  for (const epoch of epochsToCheck) {
    const entry = findHistoryEntryForEpoch(history, epoch);
    if (entry) {
      console.log(`  Epoch ${epoch}: found entry at epoch ${entry.epoch}`);
    } else {
      console.log(`  Epoch ${epoch}: NOT FOUND!`);
    }
  }

  // Show what epochs are actually in the history
  console.log("\n=== Sample of history entries ===");
  const epochs = history.map(h => h.epoch);
  console.log(`Total entries: ${epochs.length}`);
  console.log(`Min epoch: ${Math.min(...epochs)}`);
  console.log(`Max epoch: ${Math.max(...epochs)}`);

  // Check if our target epochs exist in history
  console.log("\n=== Checking if target epochs exist in history ===");
  for (const epoch of epochsToCheck) {
    const exists = epochs.includes(epoch);
    console.log(`  Epoch ${epoch}: ${exists ? "EXISTS" : "DOES NOT EXIST"}`);
  }
}

main().catch(console.error);
