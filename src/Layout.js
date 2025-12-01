import { NavLink, Outlet } from "react-router-dom";
import { NEXUS_API } from "./constants";

const linkStyle = {
  padding: "8px 16px",
  borderRadius: "5px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: "500",
  transition: "background-color 0.2s",
};

const activeLinkStyle = {
  ...linkStyle,
  backgroundColor: "#2563eb",
  color: "#ffffff",
};

const inactiveLinkStyle = {
  ...linkStyle,
  backgroundColor: "#e5e7eb",
  color: "#374151",
};

const Layout = () => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
        fontFamily: "Arial, sans-serif",
        padding: "20px",
      }}
    >
      <nav
        style={{
          marginBottom: "20px",
          display: "flex",
          gap: "10px",
        }}
      >
        <NavLink
          to="/"
          end
          style={({ isActive }) => (isActive ? activeLinkStyle : inactiveLinkStyle)}
        >
          Accounting Events
        </NavLink>
        <NavLink
          to="/staking-rewards"
          style={({ isActive }) => (isActive ? activeLinkStyle : inactiveLinkStyle)}
        >
          Staking Rewards
        </NavLink>
      </nav>

      <Outlet />

      <div
        style={{
          marginTop: "40px",
          padding: "10px",
          borderTop: "1px solid #e5e7eb",
          color: "#6b7280",
          fontSize: "12px",
          textAlign: "center",
        }}
      >
        <p>
          API Endpoint: <strong>{NEXUS_API}</strong>
        </p>
        <p>
          Repository:{" "}
          <a
            href="https://github.com/ptrus/oasis-events-exporter"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#2563eb",
              textDecoration: "none",
            }}
          >
            View on GitHub
          </a>
        </p>
        <p style={{ marginTop: "8px" }}>
          Built: {process.env.REACT_APP_BUILD_DATE || new Date().toISOString()}
        </p>
      </div>
    </div>
  );
};

export default Layout;
