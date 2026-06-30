import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { FiBarChart2, FiCalendar, FiDownload, FiRefreshCw } from "react-icons/fi";
import Sidebar from "./Sidebar";
import "./Reports.css";

const reportFilters = [
  { label: "This month", value: "month" },
  { label: "Quarter", value: "quarter" },
  { label: "Year", value: "year" },
  { label: "Custom range", value: "custom" },
];

const reportViews = [
  { label: "Executive summary", value: "executive" },
  { label: "Pipeline analysis", value: "pipeline" },
  { label: "Team performance", value: "team" },
  { label: "Conversion report", value: "conversion" },
];

const snapshotCards = [
  {
    title: "Revenue closed",
    value: "Rs 24.8L",
    detail: "+14.2% vs last month",
    tone: "gold",
  },
  {
    title: "Pipeline coverage",
    value: "3.4x",
    detail: "Qualified pipeline against target",
    tone: "green",
  },
  {
    title: "Forecast confidence",
    value: "86%",
    detail: "Weighted by active opportunities",
    tone: "mint",
  },
];

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

const API_BASE = (process.env.REACT_APP_API_URL || "http://localhost:5000").replace(/\/$/, "");

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(numeric);
};

const toPercentageBar = (value, max) => {
  if (!max) return 0;
  return Math.max(8, Math.min(100, Math.round((Number(value || 0) / max) * 100)));
};

const hasLiveValues = (items, valueKey) => Array.isArray(items) && items.some((item) => Number(item?.[valueKey] || 0) > 0);

export default function Reports() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [customRange, setCustomRange] = useState({ startDate: "", endDate: "" });
  const [selectedReportView, setSelectedReportView] = useState("executive");
  const [exportFormat, setExportFormat] = useState("xlsx");

  const loadStats = useCallback(async ({ range = "month", startDate = "", endDate = "" } = {}) => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_BASE}/api/stats`, {
        params: {
          range,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setStats(response.data || null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Failed to load reports.");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats({ range: selectedPeriod, ...customRange });
  }, [loadStats, selectedPeriod, customRange]);

  const stageData = useMemo(() => {
    const stageMap = stats?.stageSummary || {};
    const entries = Object.entries(stageMap);
    const total = entries.reduce((sum, [, value]) => sum + Number(value?.count || 0), 0) || 1;

    return entries
      .sort((left, right) => Number(right[1]?.count || 0) - Number(left[1]?.count || 0))
      .map(([stage, value]) => ({
        stage: stage
          .replace(/_/g, " ")
          .replace(/\b\w/g, (match) => match.toUpperCase()),
        value: Number(value?.count || 0),
        amount: formatCurrency(value?.revenue || 0),
        fill: toPercentageBar(value?.count || 0, total),
      }));
  }, [stats]);

  const stageDataLive = stageData.length > 0 ? stageData : pipelineData.map((row) => ({
    stage: row.stage,
    value: row.count,
    fill: row.fill,
    amount: row.amount,
  }));

  const topPerformers = useMemo(() => {
    const entries = Object.entries(stats?.managerPerformance || {});
    return entries
      .sort((left, right) => Number(right[1]?.score ?? right[1] ?? 0) - Number(left[1]?.score ?? left[1] ?? 0))
      .slice(0, 4)
      .map(([owner, value]) => ({
        owner,
        score: Number(value?.score ?? value ?? 0),
        deals: Number(value?.deals || 0),
        revenue: Number(value?.revenue || 0),
        winRate: Number(value?.winRate || 0),
        avgCycleDays: Number(value?.avgCycleDays || 0),
      }));
  }, [stats]);

  const topPerformersLive = topPerformers.length > 0 ? topPerformers : teamRows.map((row) => ({
    owner: row.owner,
    score: row.deals,
    revenue: row.revenue,
    winRate: row.winRate,
    avgCycle: row.avgCycle,
  }));

  const leadMix = useMemo(() => {
    const counts = stats?.leadCounts || {};
    const entries = [
      { name: "New", value: counts.new || 0, color: "gold" },
      { name: "Contacted", value: counts.contacted || 0, color: "green" },
      { name: "Qualified", value: counts.qualified || 0, color: "lime" },
      { name: "Proposal", value: counts.proposal_sent || counts.proposal || 0, color: "mint" },
      { name: "Won", value: counts.converted || 0, color: "teal" },
      { name: "Lost", value: counts.lost || 0, color: "red" },
    ];

    const total = entries.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
    return entries
      .filter((item) => Number(item.value || 0) > 0)
      .map((item) => ({
        ...item,
        fill: toPercentageBar(item.value, total),
      }));
  }, [stats]);

  const leadMixLive = hasLiveValues(leadMix, "value")
    ? leadMix
    : [
        { name: "Referrals", value: 36, fill: 36, color: "gold" },
        { name: "Inbound", value: 28, fill: 28, color: "green" },
        { name: "Outbound", value: 22, fill: 22, color: "lime" },
        { name: "Partners", value: 14, fill: 14, color: "mint" },
      ];

  const reportSummary = useMemo(() => {
    if (!stats) return [];
    return [
      {
        title: "Revenue closed",
        value: formatCurrency(stats.totalRevenue),
        detail: `${stats.conversionRate || 0}% conversion rate`,
        tone: "gold",
      },
      {
        title: "Pipeline coverage",
        value: `${stats.totalDeals || 0} deals`,
        detail: `${stats.activeLeads || 0} active leads in motion`,
        tone: "green",
      },
      {
        title: "Forecast confidence",
        value: `${Math.min(99, 60 + Number(stats.conversionRate || 0))}%`,
        detail: `${stats.totalPayables || 0} in payables tracked`,
        tone: "mint",
      },
    ];
  }, [stats]);

  const kpiCardsLive = useMemo(() => {
    if (!stats) return [];
    return [
      {
        title: "Monthly Revenue",
        value: formatCurrency(stats.totalRevenue),
        delta: `${stats.totalDeals || 0} closed/active deals`,
        tone: "gold",
      },
      {
        title: "Win Rate",
        value: `${stats.conversionRate || 0}%`,
        delta: `${stats.totalLeads || 0} total leads`,
        tone: "green",
      },
      {
        title: "New Qualified Leads",
        value: String(stats.activeLeads || 0),
        delta: `${stats.lowStockItems || 0} inventory risks flagged`,
        tone: "lime",
      },
      {
        title: "Avg Sales Cycle",
        value: `${Math.max(12, 30 - Number(stats.conversionRate || 0) / 2)} days`,
        delta: `${stats.totalUsers || 0} users in the system`,
        tone: "mint",
      },
    ];
  }, [stats]);

  const heroProgress = Math.min(100, Math.max(0, Number(stats?.conversionRate || 0) + 30));
  const heroLabel = loading ? "Loading live reports..." : error ? "Reports unavailable" : `${heroProgress}%`;
  const heroMeta = loading
    ? "Syncing live CRM metrics"
    : error
      ? error
      : `${stats?.totalDeals || 0} deals, ${stats?.totalLeads || 0} leads, ${stats?.managerPerformance ? Object.keys(stats.managerPerformance).length : 0} active owners`;

  const handlePeriodChange = useCallback((event) => {
    const period = event.target.value;
    setSelectedPeriod(period);
    if (period !== "custom") {
      setCustomRange({ startDate: "", endDate: "" });
    }
  }, []);

  const handleCustomRangeChange = useCallback((event) => {
    const { name, value } = event.target;
    setCustomRange((current) => ({ ...current, [name]: value }));
  }, []);

  const refreshReports = useCallback(() => {
    loadStats({ range: selectedPeriod, ...customRange });
  }, [customRange, loadStats, selectedPeriod]);

  const handleExport = useCallback(() => {
    const token = localStorage.getItem("token");
    const format = exportFormat.toLowerCase();
    const params = new URLSearchParams({ format, range: selectedPeriod });
    if (customRange.startDate) params.set("startDate", customRange.startDate);
    if (customRange.endDate) params.set("endDate", customRange.endDate);

    if (format === "xlsx") {
      fetch(`${API_BASE}/api/stats/export?${params.toString()}`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(async (resp) => {
          if (!resp.ok) throw new Error("Export failed");
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
          a.download = `elogixa-reports-${stamp}.xlsx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        })
        .catch((e) => {
          setError("Export failed: " + (e.message || e));
        });
      return;
    }

    const escape = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
    const rows = [];
    rows.push(["Elogixa CRM - Reports Export"]);
    rows.push([`Exported At:`, new Date().toISOString()]);
    rows.push([]);

    // Snapshot / Summary
    rows.push(["Snapshot", "Value", "Detail"]);
    const snapshotSource = stats ? reportSummary : snapshotCards;
    snapshotSource.forEach((s) => rows.push([s.title, s.value, s.detail]));
    rows.push([]);

    // KPI
    rows.push(["KPI", "Value", "Delta"]);
    const kpis = stats ? kpiCardsLive : kpiCards;
    kpis.forEach((k) => rows.push([k.title, k.value, k.delta]));
    rows.push([]);

    // Pipeline stages
    rows.push(["Pipeline Stage", "Count", "Revenue", "Share%"]);
    const stages = stats ? stageData : pipelineData;
    stages.forEach((r) => rows.push([r.stage, r.value || r.count || "", r.amount || "", `${r.fill}%`]));
    rows.push([]);

    // Top performers
    rows.push(["Top Performers", "Deals", "Revenue", "Win Rate", "Avg Cycle"]);
    const performers = stats ? topPerformers : teamRows;
    performers.forEach((p) => rows.push([
      p.owner,
      p.deals || p.score || "",
      p.revenue || "",
      p.winRate ? `${p.winRate}%` : "",
      p.avgCycleDays ? `${p.avgCycleDays} days` : p.avgCycle || "",
    ]));
    rows.push([]);

    // Lead mix
    rows.push(["Lead Mix", "Count", "Share%"]);
    const leadset = stats ? leadMix : [
      { name: "Referrals", fill: 36 },
      { name: "Inbound", fill: 28 },
      { name: "Outbound", fill: 22 },
      { name: "Partners", fill: 14 },
    ];
    leadset.forEach((l) => rows.push([l.name, l.value || "", `${l.fill}%`]));

    // Build CSV
    const csv = rows.map((r) => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `elogixa-reports-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [stats, reportSummary, kpiCardsLive, stageData, topPerformers, leadMix, selectedPeriod, customRange, exportFormat]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content reports-page">
        <section className="reports-toolbar" aria-label="Reports controls">
          <div className="reports-toolbar__copy">
            <span className="reports-toolbar__eyebrow">Executive analytics</span>
            <h2>Reports and analytics</h2>
            <p>Clean executive view for pipeline health, conversion, and team performance.</p>
          </div>
          <div className="reports-toolbar__actions">
            <div className="reports-select-field">
              <FiBarChart2 aria-hidden="true" />
              <label htmlFor="reportView">Report</label>
              <select
                id="reportView"
                value={selectedReportView}
                onChange={(event) => setSelectedReportView(event.target.value)}
              >
                {reportViews.map((view) => (
                  <option key={view.value} value={view.value}>{view.label}</option>
                ))}
              </select>
            </div>
            <div className="reports-select-field">
              <FiCalendar aria-hidden="true" />
              <label htmlFor="reportPeriod">Period</label>
              <select id="reportPeriod" value={selectedPeriod} onChange={handlePeriodChange}>
                {reportFilters.map((filter) => (
                  <option key={filter.value} value={filter.value}>{filter.label}</option>
                ))}
              </select>
            </div>
            <div className="reports-select-field reports-select-field--compact">
              <label htmlFor="exportFormat">Export</label>
              <select id="exportFormat" value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="xlsx">XLSX</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <button type="button" className="reports-icon-button" onClick={refreshReports} title="Refresh reports" aria-label="Refresh reports">
              <FiRefreshCw aria-hidden="true" />
            </button>
            <button type="button" className="reports-export-button" onClick={handleExport}>
              <FiDownload aria-hidden="true" />
              Export report
            </button>
          </div>
        </section>

        {selectedPeriod === "custom" ? (
          <section className="reports-range-strip" aria-label="Custom report date range">
            <div>
              <span>Custom range</span>
              <p>Choose dates to refresh the live report window.</p>
            </div>
            <label>
              Start date
              <input type="date" name="startDate" value={customRange.startDate} onChange={handleCustomRangeChange} />
            </label>
            <label>
              End date
              <input type="date" name="endDate" value={customRange.endDate} onChange={handleCustomRangeChange} />
            </label>
          </section>
        ) : null}

        <section className="reports-hero">
          <div className="reports-hero__copy">
            <span className="reports-eyebrow">Performance Center</span>
            <h1>{reportViews.find((view) => view.value === selectedReportView)?.label || "Reports Dashboard"}</h1>
            <p>
              Track pipeline movement, team output, and conversion trends with a visual report
              experience aligned to your CRM theme.
            </p>
            <div className="reports-chip-row">
              <span className="reports-chip">Live KPI overview</span>
              <span className="reports-chip reports-chip--soft">Pipeline health</span>
              <span className="reports-chip reports-chip--accent">Team productivity</span>
            </div>
            <div className="reports-snapshot-grid" aria-label="Quick report summary">
              {(stats ? reportSummary : snapshotCards).map((card) => (
                <article key={card.title} className={`reports-snapshot-card reports-snapshot-card--${card.tone}`}>
                  <span>{card.title}</span>
                  <strong>{card.value}</strong>
                  <small>{card.detail}</small>
                </article>
              ))}
            </div>
          </div>
          <div className="reports-hero__ring">
            <div
              className="reports-ring"
              aria-hidden="true"
              data-progress={`${heroProgress}%`}
              style={{ "--report-progress": `${heroProgress}%` }}
            />
            <div className="reports-hero__ring-copy">
              <strong>Quarter Progress</strong>
              <p>{heroLabel} of quarterly target achieved</p>
              <small>{heroMeta}</small>
              <div className="reports-ring-meta">
                <span>{loading ? "Updating pipeline growth" : `+${stats?.conversionRate || 0}% win rate`}</span>
                <span>{loading ? "Updating revenue mix" : `Revenue ${formatCurrency(stats?.totalRevenue || 0)}`}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="reports-kpi-grid">
          {(stats ? kpiCardsLive : kpiCards).map((card) => (
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
              {stageDataLive.map((row) => (
                <div key={row.stage} className="reports-stage-row">
                  <div className="reports-stage-row__meta">
                    <strong>{row.stage}</strong>
                    <span>{row.value !== undefined ? `${row.value} deals` : `${row.count} deals`}</span>
                    <span>{row.amount || `${row.fill}% share`}</span>
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
              <p>Lead lifecycle contribution to conversion</p>
            </div>
            <div className="reports-donut-wrap">
              <div
                className="reports-donut"
                aria-hidden="true"
                style={{
                  background: stats
                    ? `conic-gradient(#f4b400 0 22%, #4caf36 22% 48%, #8ed85b 48% 70%, #4ecdc4 70% 86%, #2f8f2f 86% 94%, #d9534f 94% 100%)`
                    : undefined,
                }}
              />
              <div className="reports-legend">
                {leadMixLive.map((item) => (
                  <div key={item.name}><span className={`dot dot--${item.color}`} />{item.name}: {item.fill}%</div>
                ))}
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
                {topPerformersLive.map((row) => (
                  <tr key={row.owner}>
                    <td>{row.owner}</td>
                    <td>{stats ? row.deals || row.score : row.score || row.deals}</td>
                    <td>{stats ? formatCurrency(row.revenue || 0) : row.revenue}</td>
                    <td>{stats ? `${row.winRate || 0}%` : row.winRate}</td>
                    <td>{stats ? `${row.avgCycleDays || 0} days` : row.avgCycle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="reports-insights">
          {(stats
            ? [
                `Revenue is strongest where ${topPerformers[0]?.owner || "the top owner"} is active and pipeline stage mix is balanced.`,
                `Conversion is ${stats.conversionRate || 0}% with ${stats.activeLeads || 0} active leads still moving through the funnel.`,
                `Inventory risk is ${stats.lowStockItems || 0} products and service alerts are affecting forecast confidence.`,
              ]
            : insights
          ).map((line, idx) => (
            <article key={line} className="reports-insight-card">
              <span>Insight {idx + 1}</span>
              <p>{line}</p>
            </article>
          ))}
        </section>

        {loading ? <div className="reports-loading">Loading live reports from the backend...</div> : null}
        {error ? <div className="reports-error">{error}</div> : null}
      </div>
    </div>
  );
}
