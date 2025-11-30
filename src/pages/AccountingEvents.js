import { useState } from "react";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import { fetchEvents } from "../fetchEvents";
import { NEXUS_API } from "../constants";

const AccountingEvents = () => {
  const [year, setYear] = useState("2025");
  const [addressError, setAddressError] = useState("");
  const [address, setAddress] = useState("");
  const [layer, setLayer] = useState("sapphire");
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddressChange = (e) => {
    const value = e.target.value.trim();
    setAddress(value);

    // Validate on input change
    if (!validateAddress(value)) {
      setAddressError(
        "Invalid address format. Valid formats: Ethereum (0x...) or Oasis (oasis1...)"
      );
    } else {
      setAddressError("");
    }
  };

  const validateAddress = (address) => {
    const ethRegex = /^0x[a-fA-F0-9]{40}$/; // Starts with '0x' and followed by 40 hex chars
    const oasisRegex = /^oasis1[a-zA-Z0-9]{40}$/; // Starts with 'oasis1' and followed by 40 chars
    if (!ethRegex.test(address) && !oasisRegex.test(address)) {
      return false;
    }
    return true;
  };

  const handleFetch = async () => {
    setRows([]);
    setIsLoading(true);

    try {
      if (!validateAddress(address)) {
        setProgress("Invalid account address. Please check and try again.");
        return;
      }

      const after = `${year}-01-01T00:00:00Z`;
      const before = `${parseInt(year) + 1}-01-01T00:00:00Z`;
      const events = await fetchEvents(NEXUS_API, address, year, before, after, layer, setProgress);
      setRows(events);
      if (events.length === 0) {
        setProgress("No events found for this address and time period.");
      } else {
        setProgress("Data ready for download!");
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setProgress("Error fetching data. Check the console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCSV = () => {
    const keys = [
      "timestamp",
      "block_height",
      "tx_hash",
      "type",
      "comment",
      "from",
      "to",
      "to_eth",
      "amount",
      "symbol",
      "decimals",
      "contract",
    ];
    const csvData = Papa.unparse({ data: rows, fields: keys });
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, `${layer}_${address}_${year}.csv`);
  };

  return (
    <div
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "10px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
        padding: "30px",
        maxWidth: "400px",
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
        Accounting Events{" "}
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
        Export all token balance changes for your account. Note: staking rewards are not included
        unless undelegated. Use the Staking Rewards tool to track delegation earnings.
      </p>

      <label style={{ display: "block", marginBottom: "15px" }}>
        <span style={{ color: "#4b5563", fontSize: "14px" }}>Enter Account Address:</span>
        <input
          type="text"
          value={address}
          onChange={handleAddressChange}
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
      <label style={{ display: "block", marginBottom: "15px" }}>
        <span style={{ color: "#4b5563", fontSize: "14px" }}>Select Layer:</span>
        <select
          value={layer}
          onChange={(e) => setLayer(e.target.value)}
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
          <option value="sapphire">Sapphire</option>
          <option value="consensus">Consensus</option>
        </select>
      </label>
      <label>
        <span style={{ color: "#4b5563", fontSize: "14px" }}>Select Year:</span>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          style={{
            marginLeft: "10px",
            padding: "5px",
            borderRadius: "5px",
            border: "1px solid #d1d5db",
            fontSize: "14px",
            color: "#374151",
            outline: "none",
          }}
        >
          <option value="2025">2025</option>
          <option value="2024">2024</option>
        </select>
      </label>
      <br />
      <br />
      <button
        onClick={handleFetch}
        disabled={addressError !== "" || address === "" || isLoading}
        style={{
          backgroundColor:
            addressError === "" && address !== "" && !isLoading ? "#2563eb" : "#d1d5db",
          color: addressError === "" && address !== "" && !isLoading ? "#ffffff" : "#9ca3af",
          padding: "10px 20px",
          borderRadius: "5px",
          border: "none",
          fontSize: "16px",
          width: "100%",
          textAlign: "center",
          marginBottom: "15px",
          cursor: addressError === "" && address !== "" && !isLoading ? "pointer" : "not-allowed",
        }}
      >
        {isLoading ? "Fetching..." : "Fetch Data"}
      </button>
      <p style={{ color: "#6b7280", fontSize: "14px", textAlign: "center" }}>{progress}</p>
      <p
        style={{
          color: "#9ca3af",
          fontSize: "14px",
          textAlign: "center",
          lineHeight: "1.5",
          marginBottom: "20px",
        }}
      >
        Experimental: Data is provided as-is without warranty. Please verify all data independently
        before use.
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
          Download CSV
        </button>
      )}
    </div>
  );
};

export default AccountingEvents;
