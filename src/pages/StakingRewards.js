import { useState } from "react";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import { fetchStakingRewards } from "../fetchStakingRewards";
import { NEXUS_API } from "../constants";

const StakingRewards = () => {
  const [year, setYear] = useState("2025");
  const [addressError, setAddressError] = useState("");
  const [address, setAddress] = useState("");
  const [granularity, setGranularity] = useState("year");
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddressChange = (e) => {
    const value = e.target.value.trim();
    setAddress(value);

    if (value && !validateAddress(value)) {
      setAddressError("Invalid address format. Use Oasis format (oasis1...)");
    } else {
      setAddressError("");
    }
  };

  const validateAddress = (addr) => {
    // Consensus layer only supports oasis1 addresses
    const oasisRegex = /^oasis1[a-zA-Z0-9]{40}$/;
    return oasisRegex.test(addr);
  };

  const handleFetch = async () => {
    setRows([]);
    setIsLoading(true);

    try {
      if (!validateAddress(address)) {
        setProgress("Invalid account address. Please check and try again.");
        return;
      }

      const rewards = await fetchStakingRewards(NEXUS_API, address, year, granularity, setProgress);

      setRows(rewards);
      if (rewards.length === 0) {
        setProgress("No staking rewards found for this address and time period.");
      } else {
        setProgress(`Found ${rewards.length} rows. Ready for download!`);
      }
    } catch (error) {
      console.error("Error fetching staking rewards:", error);
      setProgress("Error fetching data. Check the console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCSV = () => {
    const keys = [
      "start_timestamp",
      "end_timestamp",
      "start_epoch",
      "end_epoch",
      "validator",
      "shares",
      "share_price",
      "delegation_value",
      "rewards",
    ];
    const csvData = Papa.unparse({ data: rows, fields: keys });
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `staking_rewards_${address}_${year}_${granularity}.csv`);
  };

  const isButtonDisabled = addressError !== "" || address === "" || isLoading;

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "10px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        padding: "30px",
        maxWidth: "450px",
        width: "100%",
      }}
    >
      <h1
        style={{
          fontSize: "28px",
          fontWeight: "bold",
          color: "#1f2937",
          marginBottom: "15px",
          textAlign: "center",
        }}
      >
        Staking Rewards{" "}
        <span
          style={{
            fontSize: "12px",
            fontWeight: "500",
            backgroundColor: "#fef3c7",
            color: "#92400e",
            padding: "2px 8px",
            borderRadius: "4px",
            verticalAlign: "middle",
          }}
        >
          Beta
        </span>
      </h1>
      <p
        style={{
          color: "#6b7280",
          fontSize: "14px",
          textAlign: "center",
          lineHeight: "1.6",
          marginBottom: "25px",
        }}
      >
        Export staking rewards data. Tracks delegation value changes over time.
      </p>

      <label style={{ display: "block", marginBottom: "15px" }}>
        <span style={{ color: "#4b5563", fontSize: "14px" }}>
          Enter Account Address (Consensus):
        </span>
        <input
          type="text"
          value={address}
          onChange={handleAddressChange}
          placeholder="oasis1..."
          style={{
            display: "block",
            width: "100%",
            padding: "10px",
            marginTop: "5px",
            borderRadius: "5px",
            border: addressError ? "1px solid red" : "1px solid #d1d5db",
            fontSize: "14px",
            color: "#374151",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {addressError && <span style={{ color: "red", fontSize: "12px" }}>{addressError}</span>}
      </label>

      <div style={{ display: "flex", gap: "15px", marginBottom: "15px" }}>
        <label style={{ flex: 1 }}>
          <span style={{ color: "#4b5563", fontSize: "14px" }}>Year:</span>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              padding: "10px",
              marginTop: "5px",
              borderRadius: "5px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              color: "#374151",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>
        </label>

        <label style={{ flex: 1 }}>
          <span style={{ color: "#4b5563", fontSize: "14px" }}>Granularity:</span>
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              padding: "10px",
              marginTop: "5px",
              borderRadius: "5px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              color: "#374151",
              outline: "none",
              boxSizing: "border-box",
            }}
          >
            <option value="year">Yearly (~1 row/validator)</option>
            <option value="month">Monthly (~12 rows/validator)</option>
          </select>
        </label>
      </div>

      <div
        style={{
          backgroundColor: "#f3f4f6",
          borderRadius: "5px",
          padding: "12px",
          marginBottom: "15px",
          fontSize: "12px",
          color: "#6b7280",
          lineHeight: "1.6",
        }}
      >
        <strong>CSV Fields:</strong>
        <ul style={{ margin: "8px 0 0 0", paddingLeft: "18px" }}>
          <li>
            <strong>start_timestamp, end_timestamp</strong> - Period start/end dates
          </li>
          <li>
            <strong>start_epoch, end_epoch</strong> - Period start/end epochs
          </li>
          <li>
            <strong>validator</strong> - Validator address you delegated to
          </li>
          <li>
            <strong>shares</strong> - Your share balance with this validator
          </li>
          <li>
            <strong>share_price</strong> - ROSE value per share at end epoch
          </li>
          <li>
            <strong>delegation_value</strong> - Total value of your delegation (shares ×
            share_price)
          </li>
          <li>
            <strong>rewards</strong> - Staking rewards earned in this period
          </li>
        </ul>
      </div>

      <button
        onClick={handleFetch}
        disabled={isButtonDisabled}
        style={{
          backgroundColor: !isButtonDisabled ? "#2563eb" : "#d1d5db",
          color: !isButtonDisabled ? "#ffffff" : "#9ca3af",
          padding: "10px 20px",
          borderRadius: "5px",
          border: "none",
          fontSize: "16px",
          width: "100%",
          textAlign: "center",
          marginBottom: "15px",
          cursor: !isButtonDisabled ? "pointer" : "not-allowed",
        }}
      >
        {isLoading ? "Fetching..." : "Fetch Staking Rewards"}
      </button>

      <p style={{ color: "#6b7280", fontSize: "14px", textAlign: "center" }}>{progress}</p>

      <p
        style={{
          color: "#9ca3af",
          fontSize: "12px",
          textAlign: "center",
          lineHeight: "1.5",
          marginBottom: "20px",
        }}
      >
        Experimental: This tool calculates rewards based on share value changes. Data is provided
        as-is without warranty. Please verify all data independently before use.
      </p>

      {rows.length > 0 && (
        <button
          onClick={downloadCSV}
          style={{
            backgroundColor: "#10b981",
            color: "#ffffff",
            padding: "10px 20px",
            borderRadius: "5px",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
            width: "100%",
            textAlign: "center",
          }}
        >
          Download CSV ({rows.length} rows)
        </button>
      )}
    </div>
  );
};

export default StakingRewards;
