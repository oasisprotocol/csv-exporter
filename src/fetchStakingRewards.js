import axios from "axios";
import { paginatedFetch, normalizeAddress, fetchRosePrices, getRosePrice } from "./utils";

/**
 * Fetches staking rewards data for a given address and year.
 */

const ROSE_DECIMALS = 9;

/**
 * Calculate USD amount from ROSE string value.
 * @param {string} roseAmount - ROSE amount as string (e.g., "123.456")
 * @param {number} price - USD price per ROSE
 * @returns {string|null} - USD amount rounded to 2 decimal places, or null if calculation is not possible
 */
const calculateUsdFromRose = (roseAmount, price) => {
  if (!price || !roseAmount) return null;
  try {
    // Parse the ROSE amount string without parseFloat precision loss
    const isNegative = roseAmount.startsWith("-");
    const absAmount = isNegative ? roseAmount.slice(1) : roseAmount;
    const [intPart, decPart = ""] = absAmount.split(".");

    // Scale to 18 decimal places as BigInt for full precision
    const precision = 18;
    const paddedDec = decPart.padEnd(precision, "0").slice(0, precision);
    const scaledAmount = BigInt(intPart + paddedDec);

    // Scale price (8 decimal places)
    const scaledPrice = BigInt(Math.round(price * 100000000));

    // Calculate USD: (scaledAmount * scaledPrice) / 10^24 = cents
    // Add half-cent rounding (divisor/2) before division
    const divisor = 10n ** 24n;
    const halfDivisor = divisor / 2n;
    const product = scaledAmount * scaledPrice;
    const cents = (product + halfDivisor) / divisor;

    const centsNum = Number(cents);
    const dollars = (isNegative ? -centsNum : centsNum) / 100;
    return dollars.toFixed(2);
  } catch {
    return null;
  }
};

/**
 * Convert base units to ROSE (human readable string with decimals)
 * @param {BigInt} baseUnits - value in nROSE (1e-9 ROSE)
 * @param {number} extraDecimals - additional decimal places to shift (e.g., 18 for scaled values)
 */
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

/**
 * Fetch epoch info to get start_height for timestamp lookups
 */
const fetchEpochInfo = async (NEXUS_API, epochId) => {
  const response = await axios.get(`${NEXUS_API}/consensus/epochs/${epochId}`);
  return response.data;
};

/**
 * Fetch block to get timestamp
 */
const fetchBlockTimestamp = async (NEXUS_API, height) => {
  const response = await axios.get(`${NEXUS_API}/consensus/blocks/${height}`);
  return response.data?.timestamp;
};

// Hardcoded epoch ranges for supported years.
// These values are fixed for completed years and won't change.
// 2024: epoch 28809 (Jan 1 2024 01:58:02 UTC) -> epoch 37689 (Dec 31 2024 23:24:20 UTC)
// 2025: epoch 37690 (Jan 1 2025 00:23:11 UTC) -> epoch 46647 (Dec 31 2025 23:52:19 UTC)
// 2026: epoch 46648 (Jan 1 2026 00:51:10 UTC) -> ongoing (fetches latest epoch)
const EPOCH_RANGES = {
  2024: { startEpoch: 28808, endEpoch: 37690 },
  2025: { startEpoch: 37690, endEpoch: 46648 },
  2026: { startEpoch: 46648, endEpoch: null }, // endEpoch fetched dynamically
};

// Hardcoded month boundary epochs (first epoch on or after 1st of each month ~00:00 UTC)
// These were looked up from the blockchain and verified.
// Key 13 represents the end of the year (Jan 1 of next year)
const MONTH_EPOCHS_2024 = {
  1: 28808, // Jan 1 2024 (actual: 2024-01-01T00:58:59Z)
  2: 29559, // Feb 1 2024 (actual: 2024-02-01T00:13:36Z)
  3: 30259, // Mar 1 2024 (actual: 2024-03-01T00:23:55Z)
  4: 31006, // Apr 1 2024 (actual: 2024-04-01T00:07:45Z)
  5: 31733, // May 1 2024 (actual: 2024-05-01T00:06:24Z)
  6: 32485, // Jun 1 2024 (actual: 2024-06-01T00:36:58Z)
  7: 33212, // Jul 1 2024 (actual: 2024-07-01T00:45:42Z)
  8: 33964, // Aug 1 2024 (actual: 2024-08-01T00:57:12Z)
  9: 34718, // Sep 1 2024 (actual: 2024-09-01T00:36:49Z)
  10: 35449, // Oct 1 2024 (actual: 2024-10-01T00:43:21Z)
  11: 36205, // Nov 1 2024 (actual: 2024-11-01T00:38:07Z)
  12: 36934, // Dec 1 2024 (actual: 2024-12-01T00:26:18Z)
  13: 37690, // End of 2024 / Jan 1 2025 (actual: 2025-01-01T00:23:11Z)
};

const MONTH_EPOCHS_2025 = {
  1: 37690, // Jan 1 2025 (actual: 2025-01-01T00:23:11Z)
  2: 38447, // Feb 1 2025 (actual: 2025-02-01T00:14:01Z)
  3: 39131, // Mar 1 2025 (actual: 2025-03-01T00:29:56Z)
  4: 39891, // Apr 1 2025 (actual: 2025-04-01T00:56:36Z)
  5: 40626, // May 1 2025 (actual: 2025-05-01T00:25:09Z)
  6: 41387, // Jun 1 2025 (actual: 2025-06-01T00:02:11Z)
  7: 42126, // Jul 1 2025 (actual: 2025-07-01T00:53:43Z)
  8: 42890, // Aug 1 2025 (actual: 2025-08-01T00:09:35Z)
  9: 43655, // Sep 1 2025 (actual: 2025-09-01T00:37:50Z)
  10: 44393, // Oct 1 2025 (actual: 2025-10-01T00:13:04Z)
  11: 45155, // Nov 1 2025 (actual: 2025-11-01T00:55:48Z)
  12: 45889, // Dec 1 2025 (actual: 2025-12-01T00:16:34Z)
  13: 46648, // End of 2025 / Jan 1 2026 (actual: 2026-01-01T00:51:10Z)
};

const MONTH_EPOCHS_2026 = {
  1: 46648, // Jan 1 2026 (actual: 2026-01-01T00:51:10Z)
  // Remaining months will be added as they become available
};

/**
 * Get epochs for a given year (hardcoded for performance)
 */
const getEpochsForYear = async (NEXUS_API, year) => {
  const range = EPOCH_RANGES[year];
  if (!range) {
    return { startEpoch: null, endEpoch: null };
  }

  let endEpoch = range.endEpoch;
  if (endEpoch === null) {
    // Fetch latest epoch for current/incomplete year
    const latestResponse = await axios.get(`${NEXUS_API}/consensus/epochs`, {
      params: { limit: 1 },
    });
    endEpoch = latestResponse.data?.epochs?.[0]?.id;
  }

  return { startEpoch: range.startEpoch, endEpoch };
};

/**
 * Calculate share value from validator history entry (scaled by 1e18 for display)
 */
const calculateShareValue = (historyEntry) => {
  const balance = BigInt(historyEntry?.active_balance || "0");
  const shares = BigInt(historyEntry?.active_shares || "1");
  if (shares === 0n) return 0n;
  return (balance * 10n ** 18n) / shares;
};

/**
 * Calculate total value for user shares directly (more precise - single division)
 * totalValue = (userShares * active_balance) / active_shares
 */
const calculateTotalValue = (userShares, historyEntry) => {
  if (!historyEntry) return 0n;
  const balance = BigInt(historyEntry?.active_balance || "0");
  const shares = BigInt(historyEntry?.active_shares || "1");
  if (shares === 0n) return 0n;
  return (userShares * balance) / shares;
};

/**
 * Find the closest history entry for a given epoch (at or before)
 */
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

/**
 * Fetch validator history at a specific epoch using narrow from/to range.
 * This avoids pagination issues since we only need a small window.
 */
const fetchHistoryAtEpoch = async (NEXUS_API, validator, targetEpoch) => {
  const response = await axios.get(`${NEXUS_API}/consensus/validators/${validator}/history`, {
    params: {
      from: Math.max(1, targetEpoch - 10),
      to: targetEpoch + 10,
      limit: 50,
    },
  });
  const history = response.data?.history || [];
  // Sort ascending and find the entry at or before targetEpoch
  history.sort((a, b) => a.epoch - b.epoch);
  return findHistoryEntryForEpoch(history, targetEpoch);
};

// Export for testing
export { calculateUsdFromRose };

/**
 * Main function to fetch staking rewards
 */
export const fetchStakingRewards = async (NEXUS_API, address, year, granularity, setProgress) => {
  const warnings = [];
  const normalizedAddress = normalizeAddress(address);

  try {
    // Fetch ROSE prices from GitHub (cached)
    setProgress("Fetching ROSE prices...");
    const rosePrices = await fetchRosePrices((warning) => warnings.push(warning));

    // Step 1: Get epoch range for the year
    const { startEpoch, endEpoch } = await getEpochsForYear(NEXUS_API, year);

    if (!startEpoch) {
      setProgress("Could not determine epoch range for this year.");
      return [];
    }

    setProgress(`Epoch range: ${startEpoch} - ${endEpoch}. Fetching delegation events...`);

    // Step 2: Fetch all delegation events using unified pagination
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

    // Step 3: Filter events during the year (after startEpoch)
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

    setProgress(
      `Found ${relevantAddEvents.length} delegations and ${relevantDebondEvents.length} undelegations in ${year}`
    );

    // Step 4: Fetch current delegations (reliable source of truth)
    setProgress("Fetching current delegations...");
    const { items: currentDelegations } = await paginatedFetch(
      `${NEXUS_API}/consensus/accounts/${address}/delegations`,
      {},
      "delegations"
    );

    // Build current shares map
    const currentSharesPerValidator = {};
    for (const del of currentDelegations) {
      if (del.validator && del.shares) {
        const validator = normalizeAddress(del.validator);
        currentSharesPerValidator[validator] = BigInt(del.shares);
      }
    }

    // Step 5: Compute shares at startEpoch by working backwards from current
    // initial_shares = current_shares - added_during_year + removed_during_year
    setProgress("Computing initial state...");
    const sharesPerValidator = {};

    // Start with current shares
    for (const [validator, shares] of Object.entries(currentSharesPerValidator)) {
      sharesPerValidator[validator] = shares;
    }

    // Subtract shares added during the year (to get back to startEpoch state)
    for (const ev of relevantAddEvents) {
      const validator = normalizeAddress(ev.body?.escrow);
      const shares = BigInt(ev.body?.new_shares || "0");
      sharesPerValidator[validator] = (sharesPerValidator[validator] || 0n) - shares;
      if (sharesPerValidator[validator] < 0n) {
        sharesPerValidator[validator] = 0n;
      }
    }

    // Add back shares removed during the year (they existed at startEpoch)
    for (const ev of relevantDebondEvents) {
      const validator = normalizeAddress(ev.body?.escrow);
      const shares = BigInt(ev.body?.debonding_shares || "0");
      sharesPerValidator[validator] = (sharesPerValidator[validator] || 0n) + shares;
    }

    // Step 6: Find validators with activity
    const validatorsWithActivity = new Set();

    for (const [validator, shares] of Object.entries(sharesPerValidator)) {
      if (shares > 0n) {
        validatorsWithActivity.add(validator);
      }
    }

    for (const validator of Object.keys(currentSharesPerValidator)) {
      validatorsWithActivity.add(validator);
    }

    for (const ev of [...relevantAddEvents, ...relevantDebondEvents]) {
      validatorsWithActivity.add(normalizeAddress(ev.body?.escrow));
    }

    const validators = Array.from(validatorsWithActivity).filter(Boolean);

    if (validators.length === 0) {
      setProgress("No staking activity found for this address in selected year.");
      return [];
    }

    setProgress(`Found ${validators.length} active validators.`);

    // Build a cache for validator history entries to avoid redundant fetches
    // We fetch on-demand instead of all upfront for better performance
    const historyCache = {}; // { "validator:epoch": historyEntry }

    const getHistoryEntry = async (validator, epoch) => {
      const key = `${validator}:${epoch}`;
      if (historyCache[key] !== undefined) {
        return historyCache[key];
      }
      const entry = await fetchHistoryAtEpoch(NEXUS_API, validator, epoch);
      historyCache[key] = entry;
      return entry;
    };

    // Step 7: Build epoch -> events map for the year
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

    // Step 8: Determine which epochs to sample based on granularity
    setProgress("Building time slices...");
    const epochsToProcess = [];

    if (granularity === "year") {
      // Just end epoch for yearly summary (prevTotalValue initialized from startEpoch)
      epochsToProcess.push(endEpoch);
    } else {
      // Monthly: use hardcoded month boundary epochs for accurate calendar alignment
      const monthEpochs =
        year === 2024 ? MONTH_EPOCHS_2024 : year === 2025 ? MONTH_EPOCHS_2025 : MONTH_EPOCHS_2026;

      // Add month boundaries from 2 to 13 (month 1 is the baseline/start)
      for (let m = 2; m <= 13; m++) {
        const epoch = monthEpochs[m];
        if (epoch && epoch <= endEpoch) {
          epochsToProcess.push(epoch);
        }
      }

      // For incomplete years (2026+), ensure we include the current endEpoch if not already
      if (epochsToProcess.length === 0 || epochsToProcess[epochsToProcess.length - 1] < endEpoch) {
        epochsToProcess.push(endEpoch);
      }
    }

    // Step 9: Fetch timestamps for sampled epochs (and startEpoch)
    setProgress("Fetching epoch timestamps...");
    const epochTimestamps = {};

    // Fetch startEpoch timestamp first
    try {
      const startEpochInfo = await fetchEpochInfo(NEXUS_API, startEpoch);
      const startTimestamp = await fetchBlockTimestamp(NEXUS_API, startEpochInfo?.start_height);
      epochTimestamps[startEpoch] = startTimestamp;
    } catch {
      // Continue without start timestamp
    }

    for (let i = 0; i < epochsToProcess.length; i++) {
      const epoch = epochsToProcess[i];
      if (i % 10 === 0) {
        setProgress(`Fetching timestamps... ${i + 1}/${epochsToProcess.length}`);
      }
      try {
        const epochInfo = await fetchEpochInfo(NEXUS_API, epoch);
        const timestamp = await fetchBlockTimestamp(NEXUS_API, epochInfo?.start_height);
        epochTimestamps[epoch] = timestamp;
      } catch {
        // Skip epochs that don't exist
      }
    }

    // Step 10: Build results with proper earned calculation
    setProgress("Calculating rewards...");
    const results = [];

    // Initialize validator state with initial shares and compute starting value
    const validatorState = {};
    for (let i = 0; i < validators.length; i++) {
      const validator = validators[i];
      setProgress(`Computing initial value for validator ${i + 1}/${validators.length}...`);

      // Fetch history at startEpoch using cached getter
      const initialHistoryEntry = await getHistoryEntry(validator, startEpoch);
      const initialShares = sharesPerValidator[validator] || 0n;
      const initialValue = calculateTotalValue(initialShares, initialHistoryEntry);

      validatorState[validator] = {
        shares: initialShares,
        prevTotalValue: initialValue, // Start with actual value, not 0
        periodDelegationValue: 0n,
        periodUndelegationValue: 0n,
      };
    }

    let lastProcessedEpoch = startEpoch; // Start from startEpoch since we initialized with its value

    for (let i = 0; i < epochsToProcess.length; i++) {
      const epoch = epochsToProcess[i];
      const timestamp = epochTimestamps[epoch];

      if (!timestamp) continue;

      // Track period start for this row
      const periodStartEpoch = lastProcessedEpoch;
      const periodStartTimestamp = epochTimestamps[periodStartEpoch] || "";

      // Apply events from lastProcessedEpoch+1 to current epoch
      for (let e = lastProcessedEpoch + 1; e <= epoch; e++) {
        const events = eventsByEpoch[e] || [];
        for (const ev of events) {
          const state = validatorState[ev.validator];
          if (!state) continue;

          // Fetch history entry at event epoch (cached for efficiency)
          const historyEntry = await getHistoryEntry(ev.validator, e);

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

      // Output a row for each validator with shares
      for (const validator of validators) {
        const state = validatorState[validator];
        if (state.shares === 0n && state.prevTotalValue === 0n) continue;

        // Fetch history entry at this epoch (cached for efficiency)
        const historyEntry = await getHistoryEntry(validator, epoch);

        if (!historyEntry) continue;

        const shareValueScaled = calculateShareValue(historyEntry);
        const totalValue = calculateTotalValue(state.shares, historyEntry);

        const earned =
          totalValue -
          state.prevTotalValue -
          state.periodDelegationValue +
          state.periodUndelegationValue;

        const rewardsRose = toRose(earned);
        const endPrice = getRosePrice(rosePrices, timestamp);

        results.push({
          start_timestamp: periodStartTimestamp,
          end_timestamp: timestamp,
          start_epoch: periodStartEpoch,
          end_epoch: epoch,
          validator,
          shares: state.shares.toString(),
          share_price: toRose(shareValueScaled, 18),
          delegation_value: toRose(totalValue),
          rewards: rewardsRose,
          usd_price: endPrice,
          usd_reward: calculateUsdFromRose(rewardsRose, endPrice),
        });

        state.prevTotalValue = totalValue;
        state.periodDelegationValue = 0n;
        state.periodUndelegationValue = 0n;
      }
    }

    // Log warnings if any
    if (warnings.length > 0) {
      console.warn("Staking rewards fetch warnings:", warnings);
    }

    setProgress(`Generated ${results.length} rows. Ready for download!`);
    return results;
  } catch (error) {
    console.error("Error fetching staking rewards:", error);
    throw error;
  }
};
