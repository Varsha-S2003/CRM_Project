import React from "react";

export default function StatusBadge({ value }) {
  const label = value || "Unknown";
  
  let className = "status-badge";
  if (label === "Active") className += " active";
  else if (label === "Paid") className += " paid";
  else if (label === "Partial") className += " partial";
  else if (label === "Inactive") className += " inactive";
  else if (label === "Unpaid") className += " unpaid";
  else if (label === "Overdue") className += " overdue";

  return <span className={className}>{label}</span>;
}
