import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
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
  const API_BASE = "http://localhost:5000";

  const formatInr = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const getAssignmentStatusClass = (value) => {
    const status = String(value || "").toLowerCase();
    if (["new", "contacted", "qualified", "proposal", "lost", "converted"].includes(status)) {
      return status;
    }
    return "unknown";
  };

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
  const [stats, setStats] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [assignmentSnapshot, setAssignmentSnapshot] = useState(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignableEmployees, setAssignableEmployees] = useState([]);
  const [assignSelectionByLead, setAssignSelectionByLead] = useState({});
  const [assigningLeadIds, setAssigningLeadIds] = useState({});
  const [showAssignedByMePanel, setShowAssignedByMePanel] = useState(false);
  const assignedByMeRef = useRef(null);
  const navigate = useNavigate();

  // Make role check case-insensitive
  const userRole = role ? role.toUpperCase() : "";
  const isAdmin = userRole === "ADMIN";
  const isManager = userRole === "MANAGER";

  const toNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const normalizeStageKey = (stage) => {
    const value = String(stage || "").trim().toLowerCase().replace(/\s+/g, "_");
    const stageMap = {
      closed_won: "won",
      closed_lost: "lost",
      proposal_price_quote: "proposal",
      negotiate: "negotiation",
      need_analysis: "need_analysis",
      value_proposition: "value_proposition",
    };
    return stageMap[value] || value || "unknown";
  };

  const fetchDashboardStats = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setStats(null);
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    try {
      if (isAdmin) {
        const res = await axios.get(`${API_BASE}/api/stats`, { headers });
        setStats(res.data || null);
        return;
      }

      const leadsEndpoint = isManager ? "/api/leads/all" : "/api/leads/my";
      const [
        itemsResult,
        dealsResult,
        leadsResult,
        vendorsResult,
        billsResult,
        paymentsResult,
      ] = await Promise.allSettled([
        axios.get(`${API_BASE}/api/items`, { headers }),
        axios.get(`${API_BASE}/api/deals`, { headers }),
        axios.get(`${API_BASE}${leadsEndpoint}`, { headers, params: { limit: 300 } }),
        axios.get(`${API_BASE}/api/vendors`, { headers, params: { page: 1, limit: 1 } }),
        axios.get(`${API_BASE}/api/bills`, { headers }),
        axios.get(`${API_BASE}/api/payments`, { headers }),
      ]);

      const items = itemsResult.status === "fulfilled" && Array.isArray(itemsResult.value.data)
        ? itemsResult.value.data
        : [];
      const deals = dealsResult.status === "fulfilled" && Array.isArray(dealsResult.value.data)
        ? dealsResult.value.data
        : [];
      const leads = leadsResult.status === "fulfilled" && Array.isArray(leadsResult.value.data)
        ? leadsResult.value.data
        : [];
      const vendorPayload = vendorsResult.status === "fulfilled" ? vendorsResult.value.data : {};
      const bills = billsResult.status === "fulfilled" && Array.isArray(billsResult.value.data)
        ? billsResult.value.data
        : [];
      const payments = paymentsResult.status === "fulfilled" && Array.isArray(paymentsResult.value.data)
        ? paymentsResult.value.data
        : [];

      const productItems = items.filter((item) => String(item.type || "product").toLowerCase() !== "service");
      const serviceItems = items.filter((item) => String(item.type || "").toLowerCase() === "service");

      const totalAvailableStock = productItems.reduce((sum, item) => sum + toNumber(item.stock), 0);
      const totalReservedStock = productItems.reduce((sum, item) => sum + toNumber(item.reservedStock), 0);
      const totalSoldStock = productItems.reduce((sum, item) => sum + toNumber(item.soldStock), 0);
      const totalPhysicalStock = totalAvailableStock + totalReservedStock + totalSoldStock;
      const inventoryRiskBuffer = productItems.reduce((sum, item) => sum + toNumber(item.lowStockThreshold || 0), 0);
      const netFreeStock = Math.max(0, totalAvailableStock - inventoryRiskBuffer);
      const stockConversionRate = totalReservedStock > 0
        ? Math.round((totalSoldStock / totalReservedStock) * 100)
        : 0;
      const pipelinePressureRate = totalPhysicalStock > 0
        ? Math.round((totalReservedStock / totalPhysicalStock) * 100)
        : 0;
      const lowStockItems = productItems.filter(
        (item) => toNumber(item.stock) < toNumber(item.lowStockThreshold || 5)
      ).length;

      const now = new Date();
      const soon = new Date(now);
      soon.setDate(soon.getDate() + 30);
      const serviceAlerts = serviceItems.filter((item) => {
        const serviceType = String(item.serviceType || "").toLowerCase();
        if (serviceType === "storage") {
          const total = toNumber(item.totalStorage);
          const available = Math.max(0, total - toNumber(item.usedStorage));
          if (total <= 0) return true;
          return available / total < 0.2;
        }

        if (serviceType === "license" || serviceType === "subscription") {
          const expiryDateRaw = item.nextBillingDate || item.endDate || item.expiryDate;
          if (!expiryDateRaw) return false;
          const expiryDate = new Date(expiryDateRaw);
          if (Number.isNaN(expiryDate.getTime())) return false;
          return expiryDate <= soon;
        }

        return false;
      }).length;

      const normalizedDealsByStage = deals.reduce((acc, deal) => {
        const stageKey = normalizeStageKey(deal.stage);
        acc[stageKey] = (acc[stageKey] || 0) + 1;
        return acc;
      }, {});

      const monthlyRevenue = Array.from({ length: 6 }, () => 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

      deals.forEach((deal) => {
        const createdAt = new Date(deal.createdAt || deal.updatedAt || now);
        if (Number.isNaN(createdAt.getTime()) || createdAt < monthStart) return;

        const monthOffset = (createdAt.getFullYear() - monthStart.getFullYear()) * 12 + (createdAt.getMonth() - monthStart.getMonth());
        if (monthOffset < 0 || monthOffset > 5) return;

        monthlyRevenue[monthOffset] += toNumber(deal.amount || deal.value || 0);
      });

      const leadCounts = leads.reduce(
        (acc, lead) => {
          const status = String(lead.status || "new").toLowerCase();
          acc[status] = (acc[status] || 0) + 1;
          return acc;
        },
        { new: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 }
      );

      const totalLeads = leads.length;
      const convertedLeads = toNumber(leadCounts.converted);
      const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
      const activeLeads = Math.max(0, totalLeads - convertedLeads - toNumber(leadCounts.lost));

      const totalDeals = deals.length;
      const totalRevenue = deals.reduce((sum, deal) => sum + toNumber(deal.amount || deal.value), 0);

      const totalVendors = toNumber(vendorPayload?.pagination?.total || 0);
      const totalBillAmount = bills.reduce((sum, bill) => sum + toNumber(bill.amount), 0);
      const totalPaidAmount = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0);
      const totalPayables = Math.max(0, totalBillAmount - totalPaidAmount);
      const overdueBills = bills.filter((bill) => String(bill.status || "").toLowerCase() === "overdue").length;

      const managerScoreMap = deals.reduce((acc, deal) => {
        const owner = deal.assignedTo;
        const ownerName =
          (owner && (owner.name || owner.username || owner.email)) ||
          "Unassigned";
        if (!acc[ownerName]) {
          acc[ownerName] = {
            total: 0,
            won: 0,
            advanced: 0,
            revenue: 0,
          };
        }

        const stageKey = normalizeStageKey(deal.stage);
        acc[ownerName].total += 1;
        acc[ownerName].revenue += toNumber(deal.amount || deal.value);

        if (stageKey === "won") {
          acc[ownerName].won += 1;
          acc[ownerName].advanced += 1;
        } else if (["negotiation", "proposal", "value_proposition"].includes(stageKey)) {
          acc[ownerName].advanced += 1;
        }

        return acc;
      }, {});

      const maxOwnerRevenue = Math.max(
        1,
        ...Object.values(managerScoreMap).map((entry) => toNumber(entry.revenue))
      );

      const managerPerformance = Object.entries(managerScoreMap).reduce((acc, [ownerName, entry]) => {
        const total = Math.max(1, toNumber(entry.total));
        const winRate = (toNumber(entry.won) / total) * 100;
        const progressRate = (toNumber(entry.advanced) / total) * 100;
        const revenueScore = (toNumber(entry.revenue) / maxOwnerRevenue) * 100;

        const score = Math.round((winRate * 0.5) + (progressRate * 0.3) + (revenueScore * 0.2));

        acc[ownerName] = {
          score: Math.max(0, Math.min(100, score)),
          deals: toNumber(entry.total),
          won: toNumber(entry.won),
          revenue: toNumber(entry.revenue),
        };

        return acc;
      }, {});

      setStats({
        totalProducts: items.length,
        totalStock: totalAvailableStock,
        availableStock: totalAvailableStock,
        sellableStock: totalAvailableStock,
        reservedStock: totalReservedStock,
        committedStock: totalReservedStock,
        soldStock: totalSoldStock,
        physicalStock: totalPhysicalStock,
        netFreeStock,
        inventoryRiskBuffer,
        stockConversionRate,
        pipelinePressureRate,
        lowStockItems,
        serviceAlerts,
        totalRevenue,
        totalDeals,
        totalLeads,
        activeLeads,
        conversionRate,
        totalVendors,
        totalPayables,
        overdueBills,
        revenueTrend: monthlyRevenue,
        dealsByStage: normalizedDealsByStage,
        managerPerformance,
        leadCounts,
      });
    } catch (err) {
      console.error("Dashboard stats fetch error:", err);
      setStats(null);
    }
  }, [API_BASE, isAdmin, isManager]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const [dealRes, activityRes] = await Promise.all([
        axios.get("http://localhost:5000/api/deals/notifications", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get("http://localhost:5000/api/activities/notifications", {
          params: { mode: "dashboard" },
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const activityReminderNotifications = (activityRes.data.notifications || []).map((item) => ({
        _id: item.id || item._id,
        title: item.title,
        type: item.type,
        reminderTime: item.reminderTime,
        relatedTo: item.relatedTo,
      }));

      setUnreadCount((dealRes.data.unreadCount || 0) + activityReminderNotifications.length);
    } catch (err) {
      console.error("Dashboard notifications fetch error:", err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const fetchAssignmentDashboard = useCallback(async () => {
    if (isAdmin) {
      setAssignmentSnapshot(null);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      setAssignmentLoading(true);
      const res = await axios.get("http://localhost:5000/api/leads/assignment-dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAssignmentSnapshot(res.data || null);
    } catch (err) {
      console.error("Assignment dashboard fetch error:", err);
      setAssignmentSnapshot(null);
    } finally {
      setAssignmentLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchAssignmentDashboard();
  }, [fetchAssignmentDashboard]);

  useEffect(() => {
    if (!isManager) {
      setAssignableEmployees([]);
      return;
    }

    const fetchAssignableEmployees = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/employees/assignable", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAssignableEmployees(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Manager assignable employees fetch error:", err);
        setAssignableEmployees([]);
      }
    };

    fetchAssignableEmployees();
  }, [isManager]);

  const handleManagerAssignLead = useCallback(async (leadId) => {
    const selectedEmployeeId = assignSelectionByLead[leadId];
    if (!selectedEmployeeId) {
      window.alert("Select an employee first.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      setAssigningLeadIds((prev) => ({ ...prev, [leadId]: true }));

      await axios.post(
        "http://localhost:5000/api/leads/assign",
        { leadId, userId: selectedEmployeeId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAssignSelectionByLead((prev) => ({ ...prev, [leadId]: "" }));
      await fetchAssignmentDashboard();
    } catch (err) {
      console.error("Manager lead assignment error:", err);
      window.alert(err.response?.data?.message || "Failed to assign lead to employee.");
    } finally {
      setAssigningLeadIds((prev) => ({ ...prev, [leadId]: false }));
    }
  }, [assignSelectionByLead, fetchAssignmentDashboard]);

  const handleManagerUnassignLead = useCallback(async (leadId) => {
    try {
      const token = localStorage.getItem("token");
      setAssigningLeadIds((prev) => ({ ...prev, [leadId]: true }));

      await axios.post(
        "http://localhost:5000/api/leads/assign",
        { leadId, userId: "" },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchAssignmentDashboard();
    } catch (err) {
      console.error("Manager lead unassign error:", err);
      window.alert(err.response?.data?.message || "Failed to remove assignment.");
    } finally {
      setAssigningLeadIds((prev) => ({ ...prev, [leadId]: false }));
    }
  }, [fetchAssignmentDashboard]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (assignedByMeRef.current && !assignedByMeRef.current.contains(event.target)) {
        setShowAssignedByMePanel(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    { name: "Keerthana", score: 91, deals: 18, won: 7, revenue: 1240000 },
    { name: "Varsha", score: 86, deals: 15, won: 5, revenue: 980000 },
    { name: "Gayathri", score: 82, deals: 13, won: 4, revenue: 840000 },
    { name: "Vansh", score: 76, deals: 11, won: 3, revenue: 620000 }
  ];

  const demoStats = {
    totalProducts: 17,
    sellableStock: 257,
    availableStock: 257,
    totalStock: 257,
    committedStock: 206,
    reservedStock: 206,
    soldStock: 89,
    physicalStock: 552,
    netFreeStock: 207,
    stockConversionRate: 43,
    pipelinePressureRate: 44,
    lowStockItems: 2,
    totalRevenue: 3680000,
    totalDeals: 34,
    activeLeads: 9,
    conversionRate: 28,
    totalVendors: 6,
    totalPayables: 142000,
    overdueBills: 3,
  };

  const firstPositive = (...values) => {
    for (const value of values) {
      const numeric = toNumber(value);
      if (numeric > 0) return numeric;
    }
    return 0;
  };

  const metricValue = (fallback, ...values) => {
    const liveValue = firstPositive(...values);
    return liveValue > 0 ? liveValue : fallback;
  };

  const hasLiveChartValues = (data, valueKey) =>
    Array.isArray(data) && data.some((entry) => Number(entry?.[valueKey] || 0) > 0);

  const revenueData = (() => {
    const liveRevenueData = Array.isArray(stats?.revenueTrend)
      ? stats.revenueTrend.map((val, idx) => ({
          month: months[idx],
          revenue: toNumber(val),
          target: Math.round(toNumber(val) * 1.08),
        }))
      : [];

    return hasLiveChartValues(liveRevenueData, "revenue") || hasLiveChartValues(liveRevenueData, "target")
      ? liveRevenueData
      : defaultRevenueData;
  })();

  const dealsData = (() => {
    const liveDealsData = stats
      ? Object.entries(stats.dealsByStage || {}).map(([stage, count]) => ({ name: stage, value: toNumber(count) }))
      : [];

    return hasLiveChartValues(liveDealsData, "value") ? liveDealsData : defaultDealsData;
  })();

  const managerData = (() => {
    const liveManagerData = stats
      ? Object.entries(stats.managerPerformance || {})
        .map(([name, entry]) => {
          if (entry && typeof entry === "object") {
            return {
              name,
              score: Math.max(0, Math.min(100, toNumber(entry.score))),
              deals: toNumber(entry.deals),
              won: toNumber(entry.won),
              revenue: toNumber(entry.revenue),
            };
          }

          const fallbackScore = Math.max(0, Math.min(100, toNumber(entry)));
          return { name, score: fallbackScore, deals: 0, won: 0, revenue: 0 };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
      : [];

    return hasLiveChartValues(liveManagerData, "score") ? liveManagerData : defaultManagerData;
  })();
  const COLORS = ["#4caf36", "#f4b400", "#8ed85b", "#4ecdc4", "#9dc63b"];
  const chartTooltipStyle = {
    backgroundColor: "#ffffff",
    border: "1px solid #d7e5c9",
    borderRadius: "14px",
    boxShadow: "0 16px 36px rgba(31, 61, 29, 0.12)",
  };

  const dashboardMetrics = [
    {
      label: "Total Products",
      value: metricValue(demoStats.totalProducts, stats?.totalProducts),
      trend: "+6 this month",
      progress: 72,
    },
    {
      label: "Available Stock",
      value: metricValue(demoStats.sellableStock, stats?.sellableStock, stats?.availableStock, stats?.totalStock),
      trend: "Ready to sell",
      progress: 78,
    },
    {
      label: "Committed Stock",
      value: metricValue(demoStats.committedStock, stats?.committedStock, stats?.reservedStock),
      trend: "In active pipeline",
      progress: 63,
    },
    {
      label: "Sold Stock",
      value: metricValue(demoStats.soldStock, stats?.soldStock),
      trend: "+12.5% vs last month",
      progress: 52,
    },
    {
      label: "Physical Stock",
      value: metricValue(
        demoStats.physicalStock,
        stats?.physicalStock,
        (stats?.availableStock || 0) + (stats?.reservedStock || 0) + (stats?.soldStock || 0)
      ),
      trend: "Warehouse total",
      progress: 84,
    },
    {
      label: "Net Free Stock",
      value: metricValue(demoStats.netFreeStock, stats?.netFreeStock),
      trend: "After buffer",
      progress: 67,
    },
    {
      label: "Stock Conversion",
      value: `${metricValue(demoStats.stockConversionRate, stats?.stockConversionRate)}%`,
      trend: "+5.2%",
      progress: metricValue(demoStats.stockConversionRate, stats?.stockConversionRate),
    },
    {
      label: "Pipeline Pressure",
      value: `${metricValue(demoStats.pipelinePressureRate, stats?.pipelinePressureRate)}%`,
      trend: "Balanced demand",
      progress: metricValue(demoStats.pipelinePressureRate, stats?.pipelinePressureRate),
    },
    {
      label: "Low Stock Items",
      value: metricValue(demoStats.lowStockItems, stats?.lowStockItems),
      trend: "Needs reorder",
      progress: 24,
      tone: "warning",
    },
    {
      label: "Total Revenue",
      value: formatInr(metricValue(demoStats.totalRevenue, stats?.totalRevenue)),
      trend: "+18.4% forecast",
      progress: 88,
    },
    {
      label: "Total Deals",
      value: metricValue(demoStats.totalDeals, stats?.totalDeals),
      trend: "12 closing soon",
      progress: 69,
    },
    {
      label: "Active Leads",
      value: metricValue(demoStats.activeLeads, stats?.activeLeads),
      trend: "Fresh follow-ups",
      progress: 58,
    },
    {
      label: "Conversion Rate",
      value: `${metricValue(demoStats.conversionRate, stats?.conversionRate)}%`,
      trend: "+3.8%",
      progress: metricValue(demoStats.conversionRate, stats?.conversionRate),
    },
    {
      label: "Total Vendors",
      value: metricValue(demoStats.totalVendors, stats?.totalVendors),
      trend: "Approved partners",
      progress: 46,
    },
    {
      label: "Total Payables",
      value: formatInr(metricValue(demoStats.totalPayables, stats?.totalPayables)),
      trend: "Due this cycle",
      progress: 39,
      tone: "warning",
    },
    {
      label: "Overdue Bills",
      value: metricValue(demoStats.overdueBills, stats?.overdueBills),
      trend: "Action required",
      progress: 18,
      tone: "danger",
    },
  ];

  const commandCenterCards = [
    { label: "Projected Revenue", value: formatInr(4280000), note: "Based on weighted pipeline" },
    { label: "Win Probability", value: "64%", note: "Top deals scored this week" },
    { label: "Open Activities", value: "27", note: "Calls, meetings and tasks" },
    { label: "Inventory Health", value: "82%", note: "Stock coverage and demand fit" },
  ];

  const assignmentItems = assignmentSnapshot?.items || [];
  const managerIncomingItems = isManager
    ? assignmentItems.filter((item) => item.canAssign)
    : [];
  const managerAssignedByMeItems = isManager
    ? assignmentItems.filter((item) => item.canUnassign)
    : [];

  const renderAssignmentItem = (item) => (
    <div key={item._id} className="assignment-lead-item">
      <div>
        <div className="assignment-lead-title-row">
          <div className="assignment-lead-name">{item.name || "Unnamed Lead"}</div>
          <span className={`assignment-status-badge ${getAssignmentStatusClass(item.status)}`}>
            {String(item.status || "Unknown").toUpperCase()}
          </span>
        </div>
        <div className="assignment-lead-meta">
          {item.company || "No Company"}
        </div>
        <div className="assignment-lead-meta">
          Assigned by: {item.assignedBy?.name || item.assignedBy?.username || "System"}
        </div>
        <div className="assignment-lead-meta">
          Assigned to: {item.assignedTo?.name || item.assignedTo?.username || "Unassigned"}
        </div>
      </div>
      {isManager && item.canAssign ? (
        <div className="assignment-manager-action">
          <select
            value={assignSelectionByLead[item._id] || ""}
            onChange={(event) => {
              const value = event.target.value;
              setAssignSelectionByLead((prev) => ({ ...prev, [item._id]: value }));
            }}
            className="assignment-employee-select"
          >
            <option value="">Select employee</option>
            {assignableEmployees.map((employee) => (
              <option key={employee._id} value={employee._id}>
                {(employee.name || employee.username || employee.email || "Employee")} ({String(employee.role || "").toUpperCase()})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="assignment-submit-btn"
            onClick={() => handleManagerAssignLead(item._id)}
            disabled={!assignSelectionByLead[item._id] || assigningLeadIds[item._id]}
          >
            {assigningLeadIds[item._id] ? "Assigning..." : "Assign"}
          </button>
        </div>
      ) : isManager && item.canUnassign ? (
        <div className="assignment-manager-action assignment-manager-action-readonly">
          <div className={`assignment-next-action ${item.nextAction?.type || "tracking"}`}>
            {item.nextAction?.label || "Assigned"}
          </div>
          <button
            type="button"
            className="assignment-delete-btn"
            onClick={() => handleManagerUnassignLead(item._id)}
            disabled={assigningLeadIds[item._id]}
          >
            {assigningLeadIds[item._id] ? "Removing..." : "Delete Assignment"}
          </button>
        </div>
      ) : (
        <div className={`assignment-next-action ${item.nextAction?.type || "none"}`}>
          {item.nextAction?.label || "Take Action"}
        </div>
      )}
    </div>
  );

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
                {isAdmin ? "Admin Dashboard" : isManager ? "Manager Dashboard" : "Employee Dashboard"}
              </h2>
              <p className="dashboard-subtitle">
                Welcome back, {username} 
                {employee_id && <span className="employee-id"> (ID: {employee_id})</span>}
              </p>
            </div>
            <div className="dashboard-header-actions">
              {!isAdmin && (
                <div className="assignment-view-toggle" aria-label="Lead request view">
                  <button
                    type="button"
                    className="assignment-view-toggle-btn active"
                    onClick={() => navigate("/requests")}
                  >
                    Open Requests Page
                    <span className="assignment-view-toggle-count">
                      {isManager ? managerIncomingItems.length : assignmentItems.length}
                    </span>
                  </button>
                </div>
              )}
              {isManager && (
                <div className="dashboard-assigned-wrap" ref={assignedByMeRef}>
                  <button
                    type="button"
                    className="dashboard-assigned-btn"
                    onClick={() => setShowAssignedByMePanel((prev) => !prev)}
                    title="Assigned by me"
                  >
                    Assigned By Me
                    <span className="dashboard-assigned-count">{managerAssignedByMeItems.length}</span>
                  </button>
                  {showAssignedByMePanel && (
                    <div className="dashboard-assigned-panel">
                      <div className="dashboard-assigned-panel-header">
                        <h4>Assigned By Me</h4>
                      </div>
                      {assignmentLoading ? (
                        <div className="assignment-empty">Loading your assignments...</div>
                      ) : !managerAssignedByMeItems.length ? (
                        <div className="assignment-empty">You have not assigned any lead to employees yet.</div>
                      ) : (
                        <div className="assignment-lead-list">
                          {managerAssignedByMeItems.slice(0, 12).map((item) => renderAssignmentItem(item))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="dashboard-notification-bell">
                <button
                  type="button"
                  className="dashboard-notification-btn"
                  onClick={() => navigate("/notifications")}
                  title="Open Notifications"
                >
                  {"\u{1F514}"}
                  {unreadCount > 0 && (
                    <span className="dashboard-notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {!isAdmin && (
            <div className="assignment-dashboard-block">
              <div className="assignment-dashboard-header">
                <h3>{isManager ? "Leads Assigned By Admin" : "Leads Assigned To You"}</h3>
                <p>
                  {isManager
                    ? "Track leads assigned to you and distribute them to employees."
                    : "See your assigned leads and the suggested next action."}
                </p>
              </div>

              <div className="assignment-summary-grid">
                <div className="assignment-summary-card">
                  <span>Total Assigned</span>
                  <strong>{assignmentSnapshot?.summary?.totalAssignedLeads || 0}</strong>
                </div>
                <div className="assignment-summary-card">
                  <span>{isManager ? "Assign Actions" : "Call Actions"}</span>
                  <strong>
                    {isManager
                      ? assignmentSnapshot?.summary?.assignActions || 0
                      : assignmentSnapshot?.summary?.callActions || 0}
                  </strong>
                </div>
                <div className="assignment-summary-card">
                  <span>{isManager ? "Employee Follow-ups" : "Meeting Actions"}</span>
                  <strong>
                    {isManager
                      ? (assignmentSnapshot?.summary?.callActions || 0) + (assignmentSnapshot?.summary?.meetingActions || 0)
                      : assignmentSnapshot?.summary?.meetingActions || 0}
                  </strong>
                </div>
                <div className="assignment-summary-card">
                  <span>{isManager ? "No Immediate Action" : "No Immediate Action"}</span>
                  <strong>{assignmentSnapshot?.summary?.noImmediateAction || 0}</strong>
                </div>
              </div>

              <div className="assignment-compact-note">
                Lead requests are now available on a separate page for clearer handling by status.
                <div className="assignment-compact-note-actions">
                  <button
                    type="button"
                    className="assignment-submit-btn"
                    onClick={() => navigate("/requests")}
                  >
                    Go To Requests
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* Always show charts with default or live data */}
          <div className="dashboard-command-center">
            <div className="command-center-copy">
              <span>CRM Command Center</span>
              <h3>Sales, inventory and cashflow at a glance</h3>
              <p>Live data is used when available. Empty dashboard values are filled with sample business data so every card and chart stays readable.</p>
            </div>
            <div className="command-center-grid">
              {commandCenterCards.map((card) => (
                <div className="command-card" key={card.label}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.note}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="stats-grid">
            {dashboardMetrics.map((metric) => (
              <div className={`stat-card ${metric.tone ? `stat-card-${metric.tone}` : ""}`} key={metric.label}>
                <div className="stat-card-top">
                  <h4>{metric.label}</h4>
                  <span>{metric.trend}</span>
                </div>
                <h2>{metric.value}</h2>
                <div className="stat-progress" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, Math.max(8, metric.progress))}%` }} />
                </div>
              </div>
            ))}
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
                        <stop offset="0%" stopColor="#4caf36" stopOpacity={0.34} />
                        <stop offset="100%" stopColor="#4caf36" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="targetFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f4b400" stopOpacity={0.24} />
                        <stop offset="100%" stopColor="#f4b400" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e8eef8" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: "12px", paddingBottom: "12px" }} />
                    <Area type="monotone" dataKey="target" stroke="#d19500" fill="url(#targetFill)" strokeWidth={2} name="Target" />
                    <Area type="monotone" dataKey="revenue" stroke="#2f8f2f" fill="url(#revenueFill)" strokeWidth={3} name="Revenue" />
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
                <p>Normalized score across top performers (0-100)</p>
              </div>
              <span className="chart-chip chart-chip-secondary">Quarterly</span>
            </div>
            <div className="chart-wrap chart-wrap-md">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={managerData} barCategoryGap={24}>
                  <CartesianGrid stroke="#e8eef8" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    cursor={{ fill: "rgba(76, 175, 54, 0.08)" }}
                    formatter={(value, _name, payload) => {
                      const row = payload?.payload || {};
                      return [`${toNumber(value)}%`, `${row.deals || 0} deals | ${formatInr(row.revenue || 0)} revenue`];
                    }}
                  />
                  <Bar dataKey="score" radius={[10, 10, 4, 4]} maxBarSize={48}>
                    {managerData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={activeBarIndex === index ? "#f4b400" : "#4caf36"}
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
