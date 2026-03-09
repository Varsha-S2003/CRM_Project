import React from "react";
import Sidebar from "./Sidebar";

export default function Customers() {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <h1>Customers</h1>
        <p>This section is under construction. Only ADMIN and MANAGER can access.</p>
      </div>
    </div>
  );
}
