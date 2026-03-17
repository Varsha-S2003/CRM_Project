import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts";
import "./Dashboard.css";
import Sidebar from "./Sidebar";

function Dashboard() {
  const role = localStorage.getItem("role");
  const storedName = localStorage.getItem("name");
  const storedUsername = localStorage.getItem("username");
  const username =
    storedName && storedName !== "undefined" && storedName !== "null"
      ? storedName
      : storedUsername && storedUsername !== "undefined" && storedUsername !== "null"
        ? storedUsername
        : "User";
  const employee_id = localStorage.getItem("employee_id") || "";
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  // Make role check case-insensitive
  const userRole = role ? role.toUpperCase() : "";
  const isAdmin = userRole === "ADMIN";

  useEffect(() => {
    if (isAdmin) {
      const token = localStorage.getItem("token");
      fetch("http://localhost:5000/api/stats", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setStats(data))
        .catch((err) => console.error(err));
    }
  }, [isAdmin]);

  // prepare data arrays for charts once stats are available
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  
  // Default data for demo when no stats available
  const defaultRevenueData = [
    { month: "Jan", revenue: 4000, target: 4600 },
    { month: "Feb", revenue: 3000, target: 4200 },
    { month: "Mar", revenue: 5000, target: 4700 },
    { month: "Apr", revenue: 4500, target: 5100 },
    { month: "May", revenue: 6000, target: 5600 },
    { month: "Jun", revenue: 5500, target: 5900 }
  ];
  
  const defaultDealsData = [
    { name: "New", value: 25 },
    { name: "Contacted", value: 18 },
    { name: "Qualified", value: 12 },
    { name: "Won", value: 8 }
  ];
  
  const defaultManagerData = [
    { name: "John", score: 85 },
    { name: "Sarah", score: 92 },
    { name: "Mike", score: 78 },
    { name: "Lisa", score: 95 }
  ];

  const revenueData = stats?.revenueTrend?.map((val, idx) => ({
    month: months[idx],
    revenue: val,
    target: Math.round(val * 1.08),
  })) || defaultRevenueData;
  const dealsData = stats
    ? Object.entries(stats.dealsByStage).map(([stage, count]) => ({ name: stage, value: count }))
    : defaultDealsData;
  const managerData = stats
    ? Object.entries(stats.managerPerformance).map(([name, score]) => ({ name, score }))
    : defaultManagerData;
  const COLORS = ["#6f42c1", "#007bff", "#0dcaf0", "#17a2b8"];
  const chartTooltipStyle = {
    backgroundColor: "#ffffff",
    border: "1px solid #d9e3f2",
    borderRadius: "14px",
    boxShadow: "0 16px 40px rgba(42, 27, 77, 0.12)",
  };

  // state to track bar hover
  const [activeBarIndex, setActiveBarIndex] = useState(null);

  return (
    <div className="dashboard-layout">
      <Sidebar />

<div className="main-content">
        <div className="dashboard-wrapper">

          {/* Header */}
          <div className="dashboard-header">
            <div>
              <h2 className="dashboard-title">
                {isAdmin ? "Admin Dashboard" : "Employee Dashboard"}
              </h2>
              <p className="dashboard-subtitle">
                Welcome back, {username} 
                {employee_id && <span className="employee-id"> (ID: {employee_id})</span>}
              </p>
            </div>
            {isAdmin && (
              <button 
                className="add-employee-btn"
                onClick={() => navigate("/add-employee")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                Add Employee
              </button>
            )}
          </div>

          {/* Always show charts with default or live data */}
          {/* Top Stat Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Total Products</h4>
              <h2>{stats?.totalProducts || "0"}</h2>
            </div>

            <div className="stat-card">
              <h4>Total Stock</h4>
              <h2>{stats?.totalStock || "0"}</h2>
            </div>

            <div className="stat-card">
              <h4>Low Stock Items</h4>
              <h2 style={{ color: (stats?.lowStockItems || 0) > 0 ? "#6f42c1" : "#17a2b8" }}>
                {stats?.lowStockItems || "0"}
              </h2>
            </div>

            <div className="stat-card">
              <h4>Total Revenue</h4>
              <h2>${stats?.totalRevenue || "125,000"}</h2>
            </div>

            <div className="stat-card">
              <h4>Total Deals</h4>
              <h2>{stats?.totalDeals || "48"}</h2>
            </div>

            <div className="stat-card">
              <h4>Active Leads</h4>
              <h2>{stats?.activeLeads || "156"}</h2>
            </div>

            <div className="stat-card">
              <h4>Conversion Rate</h4>
              <h2>{stats?.conversionRate || "32"}%</h2>
            </div>
          </div>

          {/* Charts Row */}
          <div className="charts-grid">

            {/* Revenue Trend */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <h4>Revenue Trend</h4>
                  <p>Monthly performance against target</p>
                </div>
                <span className="chart-chip">+18.4%</span>
              </div>
              <div className="chart-wrap chart-wrap-lg">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#007bff" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#007bff" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="targetFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6f42c1" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#6f42c1" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e8eef8" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: "12px", paddingBottom: "12px" }} />
                    <Area type="monotone" dataKey="target" stroke="#6f42c1" fill="url(#targetFill)" strokeWidth={2} name="Target" />
                    <Area type="monotone" dataKey="revenue" stroke="#007bff" fill="url(#revenueFill)" strokeWidth={3} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Deals by Stage */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <h4>Deals by Stage</h4>
                  <p>Live funnel distribution</p>
                </div>
              </div>
              <div className="chart-wrap chart-wrap-md">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dealsData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={4}
                    >
                      {dealsData.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Manager Performance */}
          <div className="chart-card full-width">
            <div className="chart-card-header">
              <div>
                <h4>Manager Performance</h4>
                <p>Score comparison across top performers</p>
              </div>
              <span className="chart-chip chart-chip-secondary">Quarterly</span>
            </div>
            <div className="chart-wrap chart-wrap-md">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={managerData} barCategoryGap={24}>
                  <CartesianGrid stroke="#e8eef8" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "rgba(111, 66, 193, 0.05)" }} />
                  <Bar dataKey="score" radius={[10, 10, 4, 4]} maxBarSize={48}>
                    {managerData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={activeBarIndex === index ? "#007bff" : "#6f42c1"}
                        onMouseEnter={() => setActiveBarIndex(index)}
                        onMouseLeave={() => setActiveBarIndex(null)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
