import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import "./Dashboard.css";
import Sidebar from "./Sidebar";

function Dashboard() {
  const role = localStorage.getItem("role");
  const username = localStorage.getItem("username") || "User";
  const employee_id = localStorage.getItem("employee_id") || "";
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/");
  };

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
    { month: "Jan", value: 4000 },
    { month: "Feb", value: 3000 },
    { month: "Mar", value: 5000 },
    { month: "Apr", value: 4500 },
    { month: "May", value: 6000 },
    { month: "Jun", value: 5500 }
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

  const revenueData = stats?.revenueTrend?.map((val, idx) => ({ month: months[idx], value: val })) || defaultRevenueData;
  const dealsData = stats
    ? Object.entries(stats.dealsByStage).map(([stage, count]) => ({ name: stage, value: count }))
    : defaultDealsData;
  const managerData = stats
    ? Object.entries(stats.managerPerformance).map(([name, score]) => ({ name, score }))
    : defaultManagerData;
  const COLORS = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042"];

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
              <h4>Revenue Trend</h4>
              <LineChart width={500} height={250} data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} />
              </LineChart>
            </div>

            {/* Deals by Stage */}
            <div className="chart-card">
              <h4>Deals by Stage</h4>
              <PieChart width={300} height={250}>
                <Pie
                  data={dealsData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {dealsData.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </div>
          </div>

          {/* Manager Performance */}
          <div className="chart-card full-width">
            <h4>Manager Performance</h4>
            <BarChart width={800} height={250} data={managerData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                {managerData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      activeBarIndex === index ? "#6b5ce5" : "#4f46e5"
                    }
                    onMouseEnter={() => setActiveBarIndex(index)}
                    onMouseLeave={() => setActiveBarIndex(null)}
                  />
                ))}
              </Bar>
            </BarChart>
          </div>

          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>

        </div>
      </div>
    </div>
  );
}

export default Dashboard;
