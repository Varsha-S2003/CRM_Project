import React from "react";
import Sidebar from "./Sidebar";

export default function Settings() {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <h1>Settings</h1>
        <p>Only ADMIN can change system settings.</p>
      </div>
    </div>
  );
}
