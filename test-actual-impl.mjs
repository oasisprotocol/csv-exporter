/**
 * Test the actual fetchStakingRewards implementation with monthly granularity
 * Run with: node test-actual-impl.mjs
 */

import axios from "axios";

const NEXUS_API = "https://nexus.oasis.io/v1";
const ADDRESS = "oasis1qpnzqwj58m48sra4uuvazpqnw0zwlqfvnvjctldl";
const YEAR = 2024;

// Import the actual implementation logic (rewritten for ESM)
const ROSE_DECIMALS = 9;

const toRose = (baseUnits, extraDecimals = 0) => {
  const totalDecimals = ROSE_DECIMALS + extraDecimals;
  const str = baseUnits.toString();
  const isNegative = str.startsWith("-");
  const absStr = isNegative ? str.slice(1) : str;
  const padded = absStr.padStart(totalDecimals + 1, "0");
  const intPart = padded.slice(0, -totalDecimals) || "0";
  const decPart = padded.slice(-totalDecimals).replace(/0+$/, "") || "0";
  const result = decPart === "0" ? intPart : `${intPart}.${decPart}`;
  return isNegative ? `-${result}` : result;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeAddress = (address) => address?.toLowerCase() || "";

const paginatedFetch = async (url, params, itemsKey, limit = 1000) => {
  let items = [];
  let offset = 0;

  while (true) {
    const response = await axios.get(url, {
      params: { ...params, limit, offset },
    });

    const pageItems = response.data[itemsKey] || [];
    items = [...items, ...pageItems];

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

const EPOCH_RANGES = {
  2024: { startEpoch: 28809, endEpoch: 37689 },
};

const getEpochsForYear = async (year) => {
  const range = EPOCH_RANGES[year];
  if (!range) return { startEpoch: null, endEpoch: null };
  return { startEpoch: range.startEpoch, endEpoch: range.endEpoch };
};

const calculateShareValue = (historyEntry) => {
  const balance = BigInt(historyEntry?.active_balance || "0");
  const shares = BigInt(historyEntry?.active_shares || "1");
  if (shares === 0n) return 0n;
  return (balance * BigInt(1e18)) / shares;
};

const calculateTotalValue = (userShares, historyEntry) => {
  if (!historyEntry) return 0n;
  const balance = BigInt(historyEntry?.active_balance || "0");
  const shares = BigInt(historyEntry?.active_shares || "1");
  if (shares === 0n) return 0n;
  return (userShares * balance) / shares;
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

const fetchHistoryAtEpoch = async (validator, targetEpoch) => {
  const response = await axios.get(`${NEXUS_API}/consensus/validators/${validator}/history`, {
    params: {
      from: Math.max(1, targetEpoch - 10),
      to: targetEpoch + 10,
      limit: 50,
    },
  });
  const history = response.data?.history || [];
  history.sort((a, b) => a.epoch - b.epoch);
  return findHistoryEntryForEpoch(history, targetEpoch);
};

const fetchEpochTimestamp = async (epochId) => {
  try {
    const epochInfo = await axios.get(`${NEXUS_API}/consensus/epochs/${epochId}`);
    const blockInfo = await axios.get(`${NEXUS_API}/consensus/blocks/${epochInfo.data?.start_height}`);
    return blockInfo.data?.timestamp;
  } catch {
    return null;
  }
};

// Main function - replicates fetchStakingRewards logic
async function fetchStakingRewardsTest(address, year, granularity) {
  const normalizedAddress = normalizeAddress(address);
  const log = (msg) => console.log(`[Progress] ${msg}`);

  const { startEpoch, endEpoch } = await getEpochsForYear(year);
  log(`Epoch range: ${startEpoch} - ${endEpoch}`);

  // Fetch events
  const { items: addEscrowEvents } = await paginatedFetch(
    `${NEXUS_API}/consensus/events`,
    { rel: address, type: "staking.escrow.add" },
    "events"
  );

  const { items: debondingEvents } = await paginatedFetch(
    `${NEXUS_API}/consensus/events`,
    { rel: address, type: "staking.escrow.debonding_start" },
    "events"
  );

  // Filter events during the year
  const relevantAddEvents = addEscrowEvents.filter((ev) => {
    if (normalizeAddress(ev.body?.owner) !== normalizedAddress) return false;
    const eventEpoch = ev.body?.epoch || 0;
    return eventEpoch > startEpoch && eventEpoch <= endEpoch;
  });

  const relevantDebondEvents = debondingEvents.filter((ev) => {
    if (normalizeAddress(ev.body?.owner) !== normalizedAddress) return false;
    const eventEpoch = ev.body?.epoch || 0;
    return eventEpoch > startEpoch && eventEpoch <= endEpoch;
  });

  log(`Found ${relevantAddEvents.length} delegations and ${relevantDebondEvents.length} undelegations in ${year}`);

  // Fetch current delegations
  const { items: currentDelegations } = await paginatedFetch(
    `${NEXUS_API}/consensus/accounts/${address}/delegations`,
    {},
    "delegations"
  );

  const currentSharesPerValidator = {};
  for (const del of currentDelegations) {
    if (del.validator && del.shares) {
      const validator = normalizeAddress(del.validator);
      currentSharesPerValidator[validator] = BigInt(del.shares);
    }
  }

  // Compute shares at startEpoch
  const sharesPerValidator = {};
  for (const [validator, shares] of Object.entries(currentSharesPerValidator)) {
    sharesPerValidator[validator] = shares;
  }
  for (const ev of relevantAddEvents) {
    const validator = normalizeAddress(ev.body?.escrow);
    const shares = BigInt(ev.body?.new_shares || "0");
    sharesPerValidator[validator] = (sharesPerValidator[validator] || 0n) - shares;
    if (sharesPerValidator[validator] < 0n) sharesPerValidator[validator] = 0n;
  }
  for (const ev of relevantDebondEvents) {
    const validator = normalizeAddress(ev.body?.escrow);
    const shares = BigInt(ev.body?.debonding_shares || "0");
    sharesPerValidator[validator] = (sharesPerValidator[validator] || 0n) + shares;
  }

  // Find validators
  const validatorsWithActivity = new Set();
  for (const [validator, shares] of Object.entries(sharesPerValidator)) {
    if (shares > 0n) validatorsWithActivity.add(validator);
  }
  for (const validator of Object.keys(currentSharesPerValidator)) {
    validatorsWithActivity.add(validator);
  }

  const validators = Array.from(validatorsWithActivity).filter(Boolean);
  log(`Found ${validators.length} active validators`);

  // Fetch validator histories
  const validatorHistories = {};
  for (const validator of validators) {
    const { items: history } = await paginatedFetch(
      `${NEXUS_API}/consensus/validators/${validator}/history`,
      { from: Math.max(1, startEpoch - 100), to: endEpoch },
      "history"
    );
    history.sort((a, b) => a.epoch - b.epoch);
    validatorHistories[validator] = history;
  }

  // Build events by epoch
  const eventsByEpoch = {};
  for (const ev of relevantAddEvents) {
    const epoch = ev.body?.epoch || startEpoch;
    if (!eventsByEpoch[epoch]) eventsByEpoch[epoch] = [];
    eventsByEpoch[epoch].push({
      type: "add",
      validator: normalizeAddress(ev.body?.escrow),
      shares: BigInt(ev.body?.new_shares || "0"),
      amount: BigInt(ev.body?.amount || "0"),
    });
  }
  for (const ev of relevantDebondEvents) {
    const epoch = ev.body?.epoch || startEpoch;
    if (!eventsByEpoch[epoch]) eventsByEpoch[epoch] = [];
    eventsByEpoch[epoch].push({
      type: "debond",
      validator: normalizeAddress(ev.body?.escrow),
      shares: BigInt(ev.body?.debonding_shares || "0"),
      amount: BigInt(ev.body?.amount || "0"),
    });
  }

  // Determine epochs to process
  const epochsToProcess = [];
  const totalEpochs = endEpoch - startEpoch + 1;

  if (granularity === "year") {
    epochsToProcess.push(endEpoch);
  } else {
    const targetSamples = 12;
    const step = Math.max(1, Math.floor(totalEpochs / targetSamples));
    for (let e = startEpoch + step; e <= endEpoch; e += step) {
      epochsToProcess.push(e);
    }
    if (epochsToProcess.length === 0 || epochsToProcess[epochsToProcess.length - 1] !== endEpoch) {
      epochsToProcess.push(endEpoch);
    }
  }

  log(`Epochs to process: ${epochsToProcess.join(", ")}`);

  // Fetch timestamps
  const epochTimestamps = {};
  const startEpochInfo = await axios.get(`${NEXUS_API}/consensus/epochs/${startEpoch}`);
  const startTimestamp = (await axios.get(`${NEXUS_API}/consensus/blocks/${startEpochInfo.data?.start_height}`)).data?.timestamp;
  epochTimestamps[startEpoch] = startTimestamp;

  for (const epoch of epochsToProcess) {
    epochTimestamps[epoch] = await fetchEpochTimestamp(epoch);
    await sleep(100);
  }

  // Initialize validator state
  const validatorState = {};
  for (const validator of validators) {
    const initialHistoryEntry = await fetchHistoryAtEpoch(validator, startEpoch);
    const initialShares = sharesPerValidator[validator] || 0n;
    const initialValue = calculateTotalValue(initialShares, initialHistoryEntry);

    validatorState[validator] = {
      shares: initialShares,
      prevTotalValue: initialValue,
      periodDelegationValue: 0n,
      periodUndelegationValue: 0n,
    };

    log(`Validator ${validator}: initialShares=${initialShares}, initialValue=${toRose(initialValue)}`);
  }

  // Process epochs
  const results = [];
  let lastProcessedEpoch = startEpoch;

  for (const epoch of epochsToProcess) {
    const timestamp = epochTimestamps[epoch];
    if (!timestamp) continue;

    // Apply events
    for (let e = lastProcessedEpoch + 1; e <= epoch; e++) {
      const events = eventsByEpoch[e] || [];
      for (const ev of events) {
        const state = validatorState[ev.validator];
        if (!state) continue;

        const history = validatorHistories[ev.validator] || [];
        const historyEntry = findHistoryEntryForEpoch(history, e);

        if (ev.type === "add") {
          state.shares += ev.shares;
          const delegationValue = calculateTotalValue(ev.shares, historyEntry);
          state.periodDelegationValue += delegationValue;
        } else if (ev.type === "debond") {
          state.shares -= ev.shares;
          if (state.shares < 0n) state.shares = 0n;
          const undelegationValue = calculateTotalValue(ev.shares, historyEntry);
          state.periodUndelegationValue += undelegationValue;
        }
      }
    }

    lastProcessedEpoch = epoch;

    // Output rows
    for (const validator of validators) {
      const state = validatorState[validator];
      if (state.shares === 0n && state.prevTotalValue === 0n) continue;

      const history = validatorHistories[validator] || [];
      const historyEntry = findHistoryEntryForEpoch(history, epoch);
      if (!historyEntry) continue;

      const shareValueScaled = calculateShareValue(historyEntry);
      const totalValue = calculateTotalValue(state.shares, historyEntry);

      const earned =
        totalValue -
        state.prevTotalValue -
        state.periodDelegationValue +
        state.periodUndelegationValue;

      results.push({
        start_timestamp: epochTimestamps[startEpoch] || "",
        end_timestamp: timestamp,
        start_epoch: startEpoch,
        end_epoch: epoch,
        validator,
        shares: state.shares.toString(),
        share_price: toRose(shareValueScaled, 18),
        delegation_value: toRose(totalValue),
        rewards: toRose(earned),
        // Debug values
        _prevTotalValue: state.prevTotalValue,
        _totalValue: totalValue,
        _periodDelegationValue: state.periodDelegationValue,
        _periodUndelegationValue: state.periodUndelegationValue,
      });

      // Update state for next period
      state.prevTotalValue = totalValue;
      state.periodDelegationValue = 0n;
      state.periodUndelegationValue = 0n;
    }
  }

  return results;
}

async function main() {
  console.log("\n=== Testing Actual fetchStakingRewards Implementation ===\n");

  // Test MONTHLY
  console.log("--- MONTHLY GRANULARITY ---\n");
  const monthlyResults = await fetchStakingRewardsTest(ADDRESS, YEAR, "month");

  console.log("\nMonthly Results:");
  console.log("Epoch\t\tDate\t\t\tDelegation Value (ROSE)\t\tRewards (ROSE)");
  console.log("=".repeat(100));

  let monthlyTotal = 0n;
  for (const row of monthlyResults) {
    const date = row.end_timestamp ? new Date(row.end_timestamp).toISOString().split("T")[0] : "N/A";
    monthlyTotal += row._totalValue - row._prevTotalValue;
    console.log(`${row.end_epoch}\t\t${date}\t\t${row.delegation_value}\t\t\t\t${row.rewards}`);
  }

  console.log("=".repeat(100));
  console.log(`Monthly total rewards: ${toRose(monthlyTotal)} ROSE`);
  console.log(`Number of monthly rows: ${monthlyResults.length}`);

  // Test YEARLY
  console.log("\n\n--- YEARLY GRANULARITY ---\n");
  const yearlyResults = await fetchStakingRewardsTest(ADDRESS, YEAR, "year");

  console.log("\nYearly Results:");
  console.log("Epoch\t\tDate\t\t\tDelegation Value (ROSE)\t\tRewards (ROSE)");
  console.log("=".repeat(100));

  let yearlyTotal = 0n;
  for (const row of yearlyResults) {
    const date = row.end_timestamp ? new Date(row.end_timestamp).toISOString().split("T")[0] : "N/A";
    yearlyTotal += row._totalValue - row._prevTotalValue;
    console.log(`${row.end_epoch}\t\t${date}\t\t${row.delegation_value}\t\t\t\t${row.rewards}`);
  }

  console.log("=".repeat(100));
  console.log(`Yearly total rewards: ${toRose(yearlyTotal)} ROSE`);
  console.log(`Number of yearly rows: ${yearlyResults.length}`);

  // COMPARISON
  console.log("\n\n=== COMPARISON ===");
  console.log(`Monthly total: ${toRose(monthlyTotal)} ROSE`);
  console.log(`Yearly total:  ${toRose(yearlyTotal)} ROSE`);
  console.log(`Match: ${monthlyTotal === yearlyTotal ? "✓ YES - Totals match!" : "✗ NO - Totals DO NOT match!"}`);

  if (monthlyTotal !== yearlyTotal) {
    console.log(`\nDifference: ${toRose(monthlyTotal - yearlyTotal)} ROSE`);
  }
}

main().catch(console.error);
