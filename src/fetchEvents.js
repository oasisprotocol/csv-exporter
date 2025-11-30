import axios from "axios";
import { paginatedFetch, normalizeAddress, createAddressSet, b64ToHex } from "./utils";

const SAPPHIRE_FEE_ACCUMULATOR = "oasis1qp3r8hgsnphajmfzfuaa8fhjag7e0yt35cjxq0u4";

const ERC20_TRANSFER_SIGNATURE = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const consensusEvents = (events, myAddresses) => {
  return events.map((ev) => {
    const row = {
      timestamp: ev.timestamp,
      block_height: ev.block,
      type: ev.type,
      tx_hash: ev.tx_hash,
    };

    switch (ev.type) {
      case "staking.transfer":
        row.from = normalizeAddress(ev.body?.from);
        row.to = normalizeAddress(ev.body?.to);
        row.amount = ev.body?.amount || "0";
        row.symbol = "ROSE";
        row.decimals = 18;

        if (myAddresses.has(row.from)) {
          if (row.to === SAPPHIRE_FEE_ACCUMULATOR) {
            row.comment = "outgoing transfer (fee payment)";
          } else {
            row.comment = "outgoing transfer";
          }
        } else if (myAddresses.has(row.to)) {
          row.comment = "incoming transfer";
        } else {
          return null;
        }
        return row;

      case "staking.burn":
        row.from = normalizeAddress(ev.body?.from);
        row.to = "0";
        row.amount = ev.body?.amount || "0";
        row.symbol = "ROSE";
        row.decimals = 18;
        row.comment = "outgoing transfer (burn)";

        if (!myAddresses.has(row.from)) {
          return null;
        }
        return row;

      default:
        return null;
    }
  });
};

const sapphireEvents = (events, transactions, myAddresses) => {
  const results = events
    .map((ev) => {
      const row = {
        timestamp: ev.timestamp,
        block_height: ev.round,
        type: ev.type,
        tx_hash: ev.tx_hash,
      };

      switch (ev.type) {
        case "accounts.transfer":
          row.from = normalizeAddress(ev.body?.from);
          row.to = normalizeAddress(ev.body?.to);
          row.to_eth = normalizeAddress(ev.body?.to_eth);
          row.amount = ev.body?.amount?.Amount || "0";
          row.symbol = "ROSE";
          row.decimals = 18;

          if (myAddresses.has(row.from)) {
            if (row.to === SAPPHIRE_FEE_ACCUMULATOR) {
              row.comment = "outgoing transfer (fee payment)";
            } else {
              row.comment = "outgoing transfer";
            }
          } else if (myAddresses.has(row.to) || myAddresses.has(row.to_eth)) {
            row.comment = "incoming transfer";
          } else {
            return null;
          }
          return row;

        case "accounts.mint":
          if (!myAddresses.has(normalizeAddress(ev.body?.owner))) {
            console.warn(`Unexpected mint event: ${JSON.stringify(ev)}`);
          }
          return null;

        case "accounts.burn":
          if (!myAddresses.has(normalizeAddress(ev.body?.owner))) {
            console.warn(`Unexpected burn event: ${JSON.stringify(ev)}`);
          }
          return null;

        case "consensus_accounts.deposit":
          row.comment = "incoming deposit";
          row.to = normalizeAddress(ev.body?.to);
          row.from = normalizeAddress(ev.body?.from);
          row.amount = ev.body?.amount?.Amount || "0";
          row.symbol = "ROSE";
          row.decimals = 18;

          if (!myAddresses.has(row.to)) {
            console.warn(`Unexpected deposit event: ${JSON.stringify(ev)}`);
            return null;
          }
          return row;

        case "consensus_accounts.withdraw":
          row.comment = "outgoing withdraw";
          row.from = normalizeAddress(ev.body?.from);
          row.to = normalizeAddress(ev.body?.to);
          row.amount = ev.body?.amount?.Amount || "0";
          row.symbol = "ROSE";
          row.decimals = 18;

          if (!myAddresses.has(row.from)) {
            console.warn(`Unexpected withdraw event: ${JSON.stringify(ev)}`);
            return null;
          }
          return row;

        case "consensus_accounts.delegate":
          row.comment = "outgoing delegation";
          row.from = normalizeAddress(ev.body?.from);
          row.to = normalizeAddress(ev.body?.to);
          row.amount = ev.body?.amount?.Amount || "0";
          row.symbol = "ROSE";
          row.decimals = 18;

          if (!myAddresses.has(row.from)) {
            return null;
          }
          return row;

        case "consensus_accounts.undelegate_start":
          return null;

        case "consensus_accounts.undelegate_done":
          row.comment = "incoming undelegation";
          row.from = normalizeAddress(ev.body?.from);
          row.to = normalizeAddress(ev.body?.to);
          row.amount = ev.body?.amount?.Amount || "0";
          row.symbol = "ROSE";
          row.decimals = 18;
          return row;

        case "core.gas_used":
          return null;

        case "evm.log":
          const evmSignature = b64ToHex(ev.body?.topics?.[0]);

          switch (evmSignature) {
            case ERC20_TRANSFER_SIGNATURE:
              const logParams = ev.evm_log_params || [];
              for (const log_param of logParams) {
                if (log_param.name === "from") {
                  row.from = normalizeAddress(log_param.value);
                }
                if (log_param.name === "to") {
                  row.to = normalizeAddress(log_param.value);
                }
                if (log_param.name === "value") {
                  row.amount = log_param.value;
                }
              }
              const contractAddr = normalizeAddress("0x" + b64ToHex(ev.body?.address));

              if (
                !myAddresses.has(row.from) &&
                !myAddresses.has(row.to) &&
                !myAddresses.has(contractAddr)
              ) {
                console.warn(`Unexpected ERC20 transfer: ${JSON.stringify(ev)}`);
                return null;
              }

              row.symbol = ev.evm_token?.symbol || "UNKNOWN";
              row.decimals = ev.evm_token?.decimals ?? 18;
              row.contract = "0x" + b64ToHex(ev.body?.address);

              if (myAddresses.has(row.from)) {
                row.comment = "ERC20 Transfer (outgoing)";
                return row;
              }
              if (myAddresses.has(row.to)) {
                row.comment = "ERC20 Transfer (incoming)";
                return row;
              }
              return null;
            default:
              return null;
          }
        default:
          console.warn(`Unknown event type: ${ev.type}`);
          return null;
      }
    })
    .filter((ev) => ev !== null);

  transactions.forEach((tx) => {
    if (tx.is_likely_native_token_transfer || (tx.method === "evm.Call" && tx.amount !== "0")) {
      const txFrom = normalizeAddress(tx.from);
      const txTo = normalizeAddress(tx.to);
      const event = results.find((ev) => ev.tx_hash === tx.hash);
      if (!event || event.type !== "accounts.transfer") {
        if (myAddresses.has(txFrom)) {
          results.push({
            timestamp: tx.timestamp,
            block_height: tx.round,
            type: "accounts.transfer",
            tx_hash: tx.hash,
            from: txFrom,
            to: txTo,
            amount: tx.amount,
            symbol: "ROSE",
            decimals: 18,
            comment: "outgoing transfer",
          });
        }
        if (myAddresses.has(txTo)) {
          results.push({
            timestamp: tx.timestamp,
            block_height: tx.round,
            type: "accounts.transfer",
            tx_hash: tx.hash,
            from: txFrom,
            to: txTo,
            amount: tx.amount,
            symbol: "ROSE",
            decimals: 18,
            comment: "incoming transfer",
          });
        }
      }
    }
  });

  return results;
};

export const fetchEvents = async (NEXUS_API, address, year, before, after, layer, setProgress) => {
  const warnings = [];

  try {
    setProgress("Fetching account details...");
    const accountResponse = await axios.get(`${NEXUS_API}/${layer}/accounts/${address}`);
    const myAddresses = createAddressSet([address, accountResponse.data?.address].filter(Boolean));

    setProgress("Fetching events...");
    const { items: events, wasClipped: eventsClipped } = await paginatedFetch(
      `${NEXUS_API}/${layer}/events`,
      { after, before, rel: address },
      "events"
    );

    if (eventsClipped) {
      warnings.push("Events data was truncated. Consider using a narrower date range.");
    }

    let transactions = [];
    if (layer === "sapphire" && year === "2023") {
      setProgress("Fetching transactions...");
      const { items: txItems, wasClipped: txClipped } = await paginatedFetch(
        `${NEXUS_API}/${layer}/transactions`,
        { after, before, rel: address },
        "transactions"
      );
      transactions = txItems;

      if (txClipped) {
        warnings.push("Transaction data was truncated. Consider using a narrower date range.");
      }
    }

    // Filter events based on timestamp
    const afterTime = new Date(after).getTime();
    const beforeTime = new Date(before).getTime();

    const filteredEvents = events.filter((ev) => {
      const ts = new Date(ev.timestamp).getTime();
      return ts >= afterTime && ts < beforeTime;
    });

    const filteredTransactions = transactions.filter((tx) => {
      const ts = new Date(tx.timestamp).getTime();
      return ts >= afterTime && ts < beforeTime;
    });

    setProgress("Processing events...");
    let results;
    if (layer === "consensus") {
      results = consensusEvents(filteredEvents, myAddresses)
        .filter((ev) => ev !== null)
        .reverse();
    } else if (layer === "sapphire") {
      results = sapphireEvents(filteredEvents, filteredTransactions, myAddresses)
        .filter((ev) => ev !== null)
        .reverse();
    } else {
      throw new Error(`Unknown layer: ${layer}`);
    }

    // Log warnings if any
    if (warnings.length > 0) {
      console.warn("Fetch warnings:", warnings);
    }

    return results;
  } catch (error) {
    console.error("Error fetching events:", error.message);
    throw error;
  }
};
