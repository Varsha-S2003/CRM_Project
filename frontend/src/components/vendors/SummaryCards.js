import React from "react";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function SummaryCards({ summary }) {
  const cards = [
    { title: "Total Bills", value: money(summary?.totalBills), style: { borderLeft: "4px solid #2563eb" } },
    { title: "Total Paid", value: money(summary?.totalPaid), style: { borderLeft: "4px solid #10b981" } },
    { title: "Total Outstanding", value: money(summary?.totalOutstanding), style: { borderLeft: "4px solid #ef4444" } },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
      {cards.map((card) => (
        <div
          key={card.title}
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "16px",
            ...card.style,
          }}
        >
          <p style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
            {card.title}
          </p>
          <h3 style={{ fontSize: "20px", fontWeight: "700", color: "#1a1a2e", margin: 0 }}>{card.value}</h3>
        </div>
      ))}
    </div>
  );
}
