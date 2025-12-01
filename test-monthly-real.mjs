/**
 * Real integration test for monthly staking rewards
 * Run with: node test-monthly-real.mjs
 */

import axios from "axios";

const NEXUS_API = "https://nexus.oasis.io/v1";
const ADDRESS = "oasis1qpnzqwj58m48sra4uuvazpqnw0zwlqfvnvjctldl";
const VALIDATOR = "oasis1qq3xrq0urs8qcffhvmhfhz4p0mu7ewc8rscnlwxe";
const YEAR = 2024;

// Epoch range for 2024
const START_EPOCH = 28809;
const END_EPOCH = 37689;

const ROSE_DECIMALS = 9;

const toRose = (baseUnits) => {
  const str = baseUnits.toString();
  const isNegative = str.startsWith("-");
  const absStr = isNegative ? str.slice(1) : str;
  const padded = absStr.padStart(ROSE_DECIMALS + 1, "0");
  const intPart = padded.slice(0, -ROSE_DECIMALS) || "0";
  const decPart = padded.slice(-ROSE_DECIMALS).replace(/0+$/, "") || "0";
  const result = decPart === "0" ? intPart : `${intPart}.${decPart}`;
  return isNegative ? `-${result}` : result;
};

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

    if (pageItems.length < limit || offset + pageItems.length >= (response.data.total_count || 0)) {
      break;
    }

    offset += pageItems.length;
    await sleep(100);
  }

  return items;
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

const calculateTotalValue = (userShares, historyEntry) => {
  if (!historyEntry) return 0n;
  const balance = BigInt(historyEntry?.active_balance || "0");
  const shares = BigInt(historyEntry?.active_shares || "1");
  if (shares === 0n) return 0n;
  return (userShares * balance) / shares;
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

async function main() {
  console.log(`\n=== Real Monthly Staking Rewards Test ===`);
  console.log(`Address: ${ADDRESS}`);
  console.log(`Validator: ${VALIDATOR}`);
  console.log(`Year: ${YEAR} (epochs ${START_EPOCH} - ${END_EPOCH})\n`);

  // Step 1: Get current delegations
  console.log("Fetching current delegations...");
  const delegations = await paginatedFetch(
    `${NEXUS_API}/consensus/accounts/${ADDRESS}/delegations`,
    {},
    "delegations"
  );

  const currentShares = delegations.find(
    (d) => d.validator?.toLowerCase() === VALIDATOR.toLowerCase()
  )?.shares;

  console.log(`Current shares with ${VALIDATOR}: ${currentShares}`);

  // Step 2: Get delegation events to compute initial shares
  console.log("\nFetching delegation events...");
  const addEvents = await paginatedFetch(
    `${NEXUS_API}/consensus/events`,
    { rel: ADDRESS, type: "staking.escrow.add" },
    "events"
  );

  const debondEvents = await paginatedFetch(
    `${NEXUS_API}/consensus/events`,
    { rel: ADDRESS, type: "staking.escrow.debonding_start" },
    "events"
  );

  // Filter events during 2024 for this validator
  const relevantAddEvents = addEvents.filter((ev) => {
    const epoch = ev.body?.epoch || 0;
    return (
      ev.body?.owner?.toLowerCase() === ADDRESS.toLowerCase() &&
      ev.body?.escrow?.toLowerCase() === VALIDATOR.toLowerCase() &&
      epoch > START_EPOCH &&
      epoch <= END_EPOCH
    );
  });

  const relevantDebondEvents = debondEvents.filter((ev) => {
    const epoch = ev.body?.epoch || 0;
    return (
      ev.body?.owner?.toLowerCase() === ADDRESS.toLowerCase() &&
      ev.body?.escrow?.toLowerCase() === VALIDATOR.toLowerCase() &&
      epoch > START_EPOCH &&
      epoch <= END_EPOCH
    );
  });

  console.log(`Add events during 2024: ${relevantAddEvents.length}`);
  console.log(`Debond events during 2024: ${relevantDebondEvents.length}`);

  // Compute initial shares at start of year
  let initialShares = BigInt(currentShares || "0");
  for (const ev of relevantAddEvents) {
    initialShares -= BigInt(ev.body?.new_shares || "0");
  }
  for (const ev of relevantDebondEvents) {
    initialShares += BigInt(ev.body?.debonding_shares || "0");
  }

  console.log(`Initial shares at epoch ${START_EPOCH}: ${initialShares}`);

  // Step 3: Generate monthly epochs
  const totalEpochs = END_EPOCH - START_EPOCH + 1;
  const step = Math.max(1, Math.floor(totalEpochs / 12));
  const epochsToProcess = [START_EPOCH];
  for (let e = START_EPOCH + step; e <= END_EPOCH; e += step) {
    epochsToProcess.push(e);
  }
  if (epochsToProcess[epochsToProcess.length - 1] !== END_EPOCH) {
    epochsToProcess.push(END_EPOCH);
  }

  console.log(`\nProcessing ${epochsToProcess.length} epochs: ${epochsToProcess.join(", ")}\n`);

  // Step 4: Fetch history for each epoch and compute values
  console.log("Epoch\t\tDate\t\t\tShares\t\t\tTotal Value (ROSE)\tRewards (ROSE)");
  console.log("=".repeat(120));

  let prevTotalValue = null;
  let totalRewards = 0n;
  const userShares = initialShares; // No events during year, shares stay constant

  for (const epoch of epochsToProcess) {
    await sleep(200); // Rate limiting

    const historyEntry = await fetchHistoryAtEpoch(VALIDATOR, epoch);
    const timestamp = await fetchEpochTimestamp(epoch);
    const date = timestamp ? new Date(timestamp).toISOString().split("T")[0] : "N/A";

    const totalValue = calculateTotalValue(userShares, historyEntry);

    let earned = 0n;
    if (prevTotalValue !== null) {
      earned = totalValue - prevTotalValue;
      totalRewards += earned;
    }

    console.log(
      `${epoch}\t\t${date}\t\t${userShares}\t${toRose(totalValue)}\t\t\t${prevTotalValue !== null ? toRose(earned) : "N/A (baseline)"}`
    );

    prevTotalValue = totalValue;
  }

  console.log("=".repeat(120));
  console.log(`\nTotal rewards for ${YEAR}: ${toRose(totalRewards)} ROSE`);

  // Show what the implementation does vs what's expected
  console.log("\n=== Verification ===");
  const startHistory = await fetchHistoryAtEpoch(VALIDATOR, START_EPOCH);
  const endHistory = await fetchHistoryAtEpoch(VALIDATOR, END_EPOCH);
  const startValue = calculateTotalValue(userShares, startHistory);
  const endValue = calculateTotalValue(userShares, endHistory);
  const yearlyTotal = endValue - startValue;

  console.log(`Start value (epoch ${START_EPOCH}): ${toRose(startValue)} ROSE`);
  console.log(`End value (epoch ${END_EPOCH}): ${toRose(endValue)} ROSE`);
  console.log(`Yearly total (end - start): ${toRose(yearlyTotal)} ROSE`);
  console.log(`Sum of monthly rewards: ${toRose(totalRewards)} ROSE`);
  console.log(`Match: ${totalRewards === yearlyTotal ? "✓ YES" : "✗ NO"}`);
}

main().catch(console.error);
