import React from "react";
import Sidebar from "./Sidebar";

export default function Reports() {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <h1>Reports</h1>
        <p>Report panel for admin/manager.</p>
      </div>
    </div>
  );
}
