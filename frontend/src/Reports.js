import React from "react";
import Sidebar from "./Sidebar";
import "./Reports.css";

const kpiCards = [
  {
    title: "Monthly Revenue",
    value: "Rs 24.8L",
    delta: "+14.2% vs last month",
    tone: "gold",
  },
  {
    title: "Win Rate",
    value: "38%",
    delta: "+4.1% improvement",
    tone: "green",
  },
  {
    title: "New Qualified Leads",
    value: "126",
    delta: "+18 this week",
    tone: "lime",
  },
  {
    title: "Avg Sales Cycle",
    value: "21 days",
    delta: "-3 days faster",
    tone: "mint",
  },
];

const pipelineData = [
  { stage: "Discovery", count: 42, amount: "Rs 9.3L", fill: 78 },
  { stage: "Demo", count: 31, amount: "Rs 7.1L", fill: 63 },
  { stage: "Proposal", count: 18, amount: "Rs 5.8L", fill: 49 },
  { stage: "Negotiation", count: 11, amount: "Rs 3.4L", fill: 35 },
  { stage: "Closed Won", count: 9, amount: "Rs 2.9L", fill: 28 },
];

const teamRows = [
  { owner: "Keerthana", deals: 17, revenue: "Rs 5.6L", winRate: "41%", avgCycle: "19 days" },
  { owner: "Ninitha", deals: 14, revenue: "Rs 4.8L", winRate: "37%", avgCycle: "22 days" },
  { owner: "Suraj", deals: 11, revenue: "Rs 3.7L", winRate: "34%", avgCycle: "24 days" },
  { owner: "Aarthi", deals: 9, revenue: "Rs 2.9L", winRate: "32%", avgCycle: "27 days" },
];

const insights = [
  "Discovery to Demo conversion is strongest on Tuesdays and Wednesdays.",
  "Deals with documented meeting notes close 22% faster than average.",
  "Follow-ups sent within 24 hours increase win probability by 17%.",
];

export default function Reports() {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content reports-page">
        <section className="reports-hero">
          <div className="reports-hero__copy">
            <span className="reports-eyebrow">Performance Center</span>
            <h1>Reports Dashboard</h1>
            <p>
              Track pipeline movement, team output, and conversion trends with a visual report
              experience aligned to your CRM theme.
            </p>
            <div className="reports-chip-row">
              <span className="reports-chip">Live KPI overview</span>
              <span className="reports-chip reports-chip--soft">Pipeline health</span>
              <span className="reports-chip reports-chip--accent">Team productivity</span>
            </div>
          </div>
          <div className="reports-hero__ring">
            <div className="reports-ring" aria-hidden="true" />
            <div>
              <strong>Quarter Progress</strong>
              <p>68% of quarterly target achieved</p>
            </div>
          </div>
        </section>

        <section className="reports-kpi-grid">
          {kpiCards.map((card) => (
            <article key={card.title} className={`reports-kpi-card reports-kpi-card--${card.tone}`}>
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              <small>{card.delta}</small>
            </article>
          ))}
        </section>

        <section className="reports-grid-two">
          <article className="reports-panel">
            <div className="reports-panel__head">
              <h2>Pipeline Stage Performance</h2>
              <p>Open opportunity count and value by stage</p>
            </div>
            <div className="reports-stage-list">
              {pipelineData.map((row) => (
                <div key={row.stage} className="reports-stage-row">
                  <div className="reports-stage-row__meta">
                    <strong>{row.stage}</strong>
                    <span>{row.count} deals</span>
                    <span>{row.amount}</span>
                  </div>
                  <div className="reports-stage-row__bar" role="img" aria-label={`${row.stage} fill ${row.fill} percent`}>
                    <div style={{ width: `${row.fill}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="reports-panel reports-panel--split">
            <div className="reports-panel__head">
              <h2>Conversion Mix</h2>
              <p>Lead source contribution to closed revenue</p>
            </div>
            <div className="reports-donut-wrap">
              <div className="reports-donut" aria-hidden="true" />
              <div className="reports-legend">
                <div><span className="dot dot--gold" />Referrals: 36%</div>
                <div><span className="dot dot--green" />Inbound: 28%</div>
                <div><span className="dot dot--lime" />Outbound: 22%</div>
                <div><span className="dot dot--mint" />Partners: 14%</div>
              </div>
            </div>
          </article>
        </section>

        <section className="reports-panel reports-table-panel">
          <div className="reports-panel__head">
            <h2>Team Performance Summary</h2>
            <p>Manager-level view for activity, revenue, and cycle time</p>
          </div>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Closed Deals</th>
                  <th>Revenue</th>
                  <th>Win Rate</th>
                  <th>Avg Cycle</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map((row) => (
                  <tr key={row.owner}>
                    <td>{row.owner}</td>
                    <td>{row.deals}</td>
                    <td>{row.revenue}</td>
                    <td>{row.winRate}</td>
                    <td>{row.avgCycle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="reports-insights">
          {insights.map((line, idx) => (
            <article key={line} className="reports-insight-card">
              <span>Insight {idx + 1}</span>
              <p>{line}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
