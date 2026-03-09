import React from "react";
import Sidebar from "./Sidebar";

export default function Employees() {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <h1>Employees</h1>
        <p>Admin can view and manage employee accounts here.</p>
      </div>
    </div>
  );
}
