import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./Dashboard.css";
import "./LeadRequests.css";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Lost" },
];
const KANBAN_STATUS_COLUMNS = STATUS_FILTERS.filter((item) => item.key !== "all");
const DEAL_STAGE_FILTERS = [
  { key: "all", label: "All" },
  { key: "qualification", label: "Qualification" },
  { key: "need_analysis", label: "Need Analysis" },
  { key: "value_proposition", label: "Value Proposition" },
  { key: "proposal_price_quote", label: "Proposal / Quote" },
  { key: "negotiate", label: "Negotiate" },
  { key: "won", label: "Closed Won" },
  { key: "lost", label: "Closed Lost" },
];
const DEAL_STAGE_COLUMNS = DEAL_STAGE_FILTERS.filter((item) => item.key !== "all");
const REQUEST_TYPE_FILTERS = [
  { key: "lead", label: "Lead Requests" },
  { key: "deal", label: "Deal Requests" },
  { key: "contact", label: "Contacts" },
];
const BILLING_CYCLE_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "6_months", label: "6 Months" },
  { value: "yearly", label: "Yearly" },
];

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const normalizeDealStage = (value) => {
  const stage = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (stage === "proposal") return "proposal_price_quote";
  if (stage === "closed_won") return "won";
  if (stage === "closed_lost") return "lost";
  return stage;
};

const normalizeDealRequest = (deal) => {
  const stage = normalizeDealStage(deal?.stage);
  const status = String(deal?.status || (stage === "lost" ? "Inactive" : "Active")).trim();
  const leadAssignedBy = normalizeAssignedUser(deal?.sourceLeadId?.assignedBy);
  const leadAssignedTo = normalizeAssignedUser(deal?.sourceLeadId?.assignedTo);
  const dealAssignedTo = normalizeAssignedUser(deal?.assignedTo);
  const managerAssignedBy = normalizeAssignedUser(dealAssignedTo?.reportsTo);
  const directAssignedBy = normalizeAssignedUser(deal?.assignedBy);

  return {
    ...deal,
    stage,
    status,
    company: String(deal?.company || deal?.customerId?.company || "").trim(),
    contact: String(deal?.contact || deal?.customerId?.name || "").trim(),
    email: String(deal?.email || deal?.customerId?.email || "").trim(),
    phone: String(deal?.phone || deal?.customerId?.phone || "").trim(),
    assignedBy: leadAssignedBy || managerAssignedBy || directAssignedBy || null,
    assignedTo: dealAssignedTo || leadAssignedTo || null,
  };
};

const normalizeAssignedUser = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  return { _id: value };
};

const dedupeDealsById = (items) => {
  const map = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const normalized = normalizeDealRequest(item);
    const key = String(normalized?._id || "").trim();
    if (!key) return;
    map.set(key, normalized);
  });

  return Array.from(map.values());
};

const getStatusClassName = (value) => {
  const status = normalizeStatus(value);
  if (["new", "contacted", "qualified", "proposal", "proposal_sent", "converted", "lost"].includes(status)) return status;
  if (["qualification", "need_analysis", "value_proposition", "proposal_price_quote", "negotiate", "won"].includes(status)) return status;
  return "unknown";
};

const formatLabelValue = (value, fallback = "-") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const getInitials = (value) => {
  const text = String(value || "").trim();
  if (!text) return "NA";
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

function LeadRequests() {
  const navigate = useNavigate();
  const role = (localStorage.getItem("role") || "").toUpperCase();
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";

  const [assignmentSnapshot, setAssignmentSnapshot] = useState(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignableEmployees, setAssignableEmployees] = useState([]);
  const [assignSelectionByLead, setAssignSelectionByLead] = useState({});
  const [assigningLeadIds, setAssigningLeadIds] = useState({});
  const [convertingLeadIds, setConvertingLeadIds] = useState({});
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeDealStage, setActiveDealStage] = useState("all");
  const [activeRequestType, setActiveRequestType] = useState("lead");
  const [dealRequests, setDealRequests] = useState([]);
  const [contactRequests, setContactRequests] = useState([]);
  const [movingDealIds, setMovingDealIds] = useState({});
  const [showDealAdvanceModal, setShowDealAdvanceModal] = useState(false);
  const [pendingDealAdvance, setPendingDealAdvance] = useState(null);
  const [dealAdvanceForm, setDealAdvanceForm] = useState({ quantity: "", billingCycle: "" });
  const [auxiliaryLoading, setAuxiliaryLoading] = useState(false);

  const fetchAssignmentDashboard = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      setAssignmentLoading(true);
      if (isAdmin) {
        const res = await axios.get("http://localhost:5000/api/leads/all", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const items = (Array.isArray(res.data) ? res.data : []).map((lead) => ({
          _id: lead._id,
          name: lead.name,
          company: lead.company,
          email: lead.email,
          phone: lead.phone || lead.mobile || "",
          source: lead.source || lead.leadSource || "",
          status: lead.status,
          assignedBy: normalizeAssignedUser(lead.assignedBy),
          assignedTo: normalizeAssignedUser(lead.assignedTo),
          canAssign: false,
          canUnassign: false,
          nextAction: null,
        }));

        setAssignmentSnapshot({
          summary: {
            totalAssignedLeads: items.length,
            callActions: 0,
            meetingActions: 0,
          },
          items,
        });
      } else {
        const res = await axios.get("http://localhost:5000/api/leads/assignment-dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAssignmentSnapshot(res.data || null);
      }
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
    if (!(isManager || isAdmin)) {
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
  }, [isAdmin, isManager]);

  const fetchAuxiliaryRequests = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      setAuxiliaryLoading(true);

      const [dealRes, contactRes] = await Promise.all([
        axios.get("http://localhost:5000/api/deals", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get("http://localhost:5000/api/customers", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setDealRequests(dedupeDealsById(dealRes.data));
      setContactRequests(Array.isArray(contactRes.data) ? contactRes.data : []);
    } catch (err) {
      console.error("Requests fetch error:", err);
      setDealRequests([]);
      setContactRequests([]);
    } finally {
      setAuxiliaryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuxiliaryRequests();
  }, [fetchAuxiliaryRequests]);

  useEffect(() => {
    if (activeRequestType === "lead") return;
    fetchAuxiliaryRequests();
  }, [activeRequestType, fetchAuxiliaryRequests]);

  useEffect(() => {
    if (activeRequestType !== "deal") return undefined;

    const handleRefreshOnFocus = () => {
      fetchAuxiliaryRequests();
    };

    window.addEventListener("focus", handleRefreshOnFocus);
    return () => window.removeEventListener("focus", handleRefreshOnFocus);
  }, [activeRequestType, fetchAuxiliaryRequests]);

  useEffect(() => {
    if (activeRequestType !== "deal" || !isManager) return undefined;

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchAuxiliaryRequests();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [activeRequestType, fetchAuxiliaryRequests, isManager]);

  useEffect(() => {
    const handleDealRefresh = () => {
      fetchAuxiliaryRequests();
    };

    window.addEventListener("deal-updated", handleDealRefresh);
    window.addEventListener("inventory-updated", handleDealRefresh);
    window.addEventListener("customer-updated", handleDealRefresh);
    return () => {
      window.removeEventListener("deal-updated", handleDealRefresh);
      window.removeEventListener("inventory-updated", handleDealRefresh);
      window.removeEventListener("customer-updated", handleDealRefresh);
    };
  }, [fetchAuxiliaryRequests]);

  const handleManagerAssignLead = useCallback(
    async (leadId) => {
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
    },
    [assignSelectionByLead, fetchAssignmentDashboard]
  );

  const handleManagerUnassignLead = useCallback(
    async (leadId) => {
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
    },
    [fetchAssignmentDashboard]
  );

  const requestItems = useMemo(() => {
    const assignmentItems = assignmentSnapshot?.items || [];
    return assignmentItems;
  }, [assignmentSnapshot]);

  const statusCounts = useMemo(() => {
    const counts = requestItems.reduce(
      (acc, item) => {
        const key = normalizeStatus(item.status);
        if (key === "proposal" || key === "proposal_sent") {
          acc.qualified += 1;
          return acc;
        }
        if (acc[key] === undefined) return acc;
        acc[key] += 1;
        return acc;
      },
      {
        all: requestItems.length,
        new: 0,
        contacted: 0,
        qualified: 0,
        converted: 0,
        lost: 0,
      }
    );

    return counts;
  }, [requestItems]);

  const filteredItems = useMemo(() => {
    if (activeStatus === "all") return requestItems;
    if (activeStatus === "qualified") {
      return requestItems.filter((item) => ["qualified", "proposal", "proposal_sent"].includes(normalizeStatus(item.status)));
    }
    return requestItems.filter((item) => normalizeStatus(item.status) === activeStatus);
  }, [activeStatus, requestItems]);

  const visibleColumns = useMemo(() => {
    if (activeStatus === "all") return KANBAN_STATUS_COLUMNS;
    const selected = KANBAN_STATUS_COLUMNS.find((item) => item.key === activeStatus);
    return selected ? [selected] : KANBAN_STATUS_COLUMNS;
  }, [activeStatus]);

  const itemsByStatus = useMemo(() => {
    const grouped = {
      new: [],
      contacted: [],
      qualified: [],
      converted: [],
      lost: [],
    };

    filteredItems.forEach((item) => {
      const key = normalizeStatus(item.status);
      if (key === "proposal" || key === "proposal_sent") {
        grouped.qualified.push(item);
        return;
      }
      if (grouped[key]) grouped[key].push(item);
    });

    return grouped;
  }, [filteredItems]);

  const dealStageCounts = useMemo(() => {
    return dealRequests.reduce(
      (acc, item) => {
        const stage = normalizeDealStage(item.stage);
        if (acc[stage] === undefined) return acc;
        acc[stage] += 1;
        return acc;
      },
      {
        all: dealRequests.length,
        qualification: 0,
        need_analysis: 0,
        value_proposition: 0,
        proposal_price_quote: 0,
        negotiate: 0,
        won: 0,
        lost: 0,
      }
    );
  }, [dealRequests]);

  const filteredDealRequests = useMemo(() => {
    if (activeDealStage === "all") return dealRequests;
    return dealRequests.filter((item) => normalizeDealStage(item.stage) === activeDealStage);
  }, [activeDealStage, dealRequests]);

  const visibleDealColumns = useMemo(() => {
    if (activeDealStage === "all") return DEAL_STAGE_COLUMNS;
    const selected = DEAL_STAGE_COLUMNS.find((item) => item.key === activeDealStage);
    return selected ? [selected] : DEAL_STAGE_COLUMNS;
  }, [activeDealStage]);

  const dealItemsByStage = useMemo(() => {
    const grouped = {
      qualification: [],
      need_analysis: [],
      value_proposition: [],
      proposal_price_quote: [],
      negotiate: [],
      won: [],
      lost: [],
    };

    filteredDealRequests.forEach((item) => {
      const key = normalizeDealStage(item.stage);
      if (grouped[key]) grouped[key].push(item);
    });

    return grouped;
  }, [filteredDealRequests]);

  const moveDealStage = useCallback(async (item, targetStage, extraPayload = {}) => {
    if (!item?._id) return;
    if (!targetStage) return;

    const stageLabels = {
      need_analysis: "Need Analysis",
      proposal_price_quote: "Proposal / Quote",
    };
    const targetLabel = stageLabels[normalizeDealStage(targetStage)] || String(targetStage || "");

    try {
      const token = localStorage.getItem("token");
      setMovingDealIds((prev) => ({ ...prev, [item._id]: true }));
      const res = await axios.put(
        `http://localhost:5000/api/deals/${item._id}/stage`,
        { stage: targetStage, ...extraPayload },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updatedDeal = res.data || {};
      setDealRequests((prev) =>
        dedupeDealsById(
          prev.map((deal) =>
            String(deal._id) === String(item._id) ? { ...deal, ...normalizeDealRequest(updatedDeal) } : deal
          )
        )
      );
      await fetchAuxiliaryRequests();
      setShowDealAdvanceModal(false);
      setPendingDealAdvance(null);
      setDealAdvanceForm({ quantity: "", billingCycle: "" });
    } catch (err) {
      console.error(`Failed to move deal to ${targetLabel}:`, err);
      const errorMessage = err.response?.data?.message || `Failed to move deal to ${targetLabel}.`;
      const isLowStockError = /low stock|insufficient stock|out of stock/i.test(String(errorMessage));

      if (isLowStockError) {
        const customerWillWait = window.confirm(
          `${errorMessage}\n\nCustomer said they can wait for refill?\n\nPress OK for YES (keep in Need Analysis + wait for refill).\nPress Cancel for NO.`
        );

        if (customerWillWait) {
          try {
            const token = localStorage.getItem("token");
            await axios.put(
              `http://localhost:5000/api/deals/${item._id}/waiting-restock`,
              {
                availableQuantity: err.response?.data?.availableQuantity,
                requestedQuantity: err.response?.data?.requestedQuantity,
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } catch (restockErr) {
            console.error("Failed to create wait-for-refill notification:", restockErr);
          }
        }

        await fetchAuxiliaryRequests();
        setShowDealAdvanceModal(false);
        setPendingDealAdvance(null);
        setDealAdvanceForm({ quantity: "", billingCycle: "" });
        window.alert(
          `${errorMessage}\n\nThere is not enough stock for this quantity.\n\nThe customer has been informed by email that we will follow up as soon as inventory is restocked.\n\nThe email now includes YES and NO buttons:\nYES keeps the deal in the current stage.\nNO moves the deal to Closed Lost with a reason.`
        );
        return;
      }

      window.alert(errorMessage);
    } finally {
      setMovingDealIds((prev) => ({ ...prev, [item._id]: false }));
    }
  }, [fetchAuxiliaryRequests]);

  const openDealAdvanceModal = useCallback((item, targetStage) => {
    const productTypeRaw =
      typeof item?.product === "object" ? item?.product?.type : "";
    const inferredType = String(productTypeRaw || "").toLowerCase();

    const itemType = inferredType === "product" || inferredType === "service"
      ? inferredType
      : item?.billingCycle
        ? "service"
        : item?.quantity
          ? "product"
          : "unknown";
    setPendingDealAdvance({
      dealId: item?._id,
      itemType,
      targetStage,
      dealName: item?.name || "Deal",
    });
    setDealAdvanceForm({
      quantity: item?.quantity ?? "",
      billingCycle: String(item?.billingCycle || "").trim(),
    });
    setShowDealAdvanceModal(true);
  }, []);

  const submitDealAdvance = useCallback(async () => {
    if (!pendingDealAdvance?.dealId) return;

    const currentDeal = dealRequests.find((deal) => deal._id === pendingDealAdvance.dealId);
    if (!currentDeal) {
      setShowDealAdvanceModal(false);
      setPendingDealAdvance(null);
      return;
    }

    const quantityValue = Number(dealAdvanceForm.quantity);
    const normalizedBillingCycle = String(dealAdvanceForm.billingCycle || "").trim();
    const itemType = pendingDealAdvance.itemType;
    const targetStage = pendingDealAdvance.targetStage || "proposal_price_quote";

    if (itemType === "product") {
      if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
        window.alert("Quantity is required when moving a product deal to Proposal stage.");
        return;
      }

      await moveDealStage(currentDeal, targetStage, { quantity: quantityValue });
      return;
    }

    if (itemType === "service") {
      if (!normalizedBillingCycle) {
        window.alert("Plan / Billing Cycle is required when moving a service deal to Proposal stage.");
        return;
      }
      await moveDealStage(currentDeal, targetStage, { billingCycle: normalizedBillingCycle });
      return;
    }

    const fallbackPayload = {};
    if (Number.isFinite(quantityValue) && quantityValue > 0) {
      fallbackPayload.quantity = quantityValue;
    }
    if (normalizedBillingCycle) {
      fallbackPayload.billingCycle = normalizedBillingCycle;
    }
    await moveDealStage(currentDeal, targetStage, fallbackPayload);
  }, [dealAdvanceForm.billingCycle, dealAdvanceForm.quantity, dealRequests, moveDealStage, pendingDealAdvance]);

  const openActionPage = (item) => {
    const nextActionType = String(item.nextAction?.type || "").toLowerCase();
    if (!["call", "meeting", "task"].includes(nextActionType)) {
      return;
    }

    const params = new URLSearchParams({
      type: nextActionType,
      create: "1",
      relatedType: "Lead",
      relatedId: String(item._id || ""),
      relatedName: String(item.name || "Lead"),
      source: "requests",
    });

    navigate(`/activities?${params.toString()}`);
  };

  const renderEmployeeAction = (item) => {
    const actionType = String(item.nextAction?.type || "none").toLowerCase();
    const label = item.nextAction?.label || "";

    if (["call", "meeting", "task"].includes(actionType)) {
      return (
        <button
          type="button"
          className={`assignment-next-action assignment-next-action-btn ${actionType}`}
          onClick={() => openActionPage(item)}
        >
          {label}
        </button>
      );
    }

    return null;
  };

  const handleConvertToDeal = useCallback(
    async (item) => {
      if (!item?._id) return;

      const status = normalizeStatus(item.status);
      if (!["qualified", "proposal", "proposal_sent"].includes(status)) {
        window.alert("Only qualified leads can be converted to deal.");
        return;
      }

      if (!window.confirm("Convert this lead to deal? This will create customer and move lead to Converted.")) {
        return;
      }

      try {
        const token = localStorage.getItem("token");
        setConvertingLeadIds((prev) => ({ ...prev, [item._id]: true }));

        await axios.put(
          `http://localhost:5000/api/leads/${item._id}/convert`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );

        window.alert("Lead converted successfully. Customer created and deal moved to Qualification stage.");
        await fetchAssignmentDashboard();
      } catch (err) {
        console.error(err);
        window.alert(err.response?.data?.message || "Failed to convert lead to deal.");
      } finally {
        setConvertingLeadIds((prev) => ({ ...prev, [item._id]: false }));
      }
    },
    [fetchAssignmentDashboard]
  );

  const renderLeadCard = (item) => (
    <div key={item._id} className="lead-requests-card">
      <div className="lead-requests-card-top">
        <div className="lead-requests-card-header">
          <div className="lead-requests-card-identity">
            <div className="lead-requests-avatar">{getInitials(item.name)}</div>
            <div>
              <div className="assignment-lead-name">{item.name || "Unnamed Lead"}</div>
              <div className="lead-requests-subtitle">Lead</div>
            </div>
          </div>
          <div className="lead-requests-card-badges">
            <span className={`lead-status-badge ${getStatusClassName(item.status)}`}>
              {String(item.status || "Unknown").toUpperCase()}
            </span>
            <span className={`lead-assignment-badge ${item.assignedTo ? "assigned" : "unassigned"}`}>
              {item.assignedTo ? "ASSIGNED" : "UNASSIGNED"}
            </span>
          </div>
        </div>

        <div className="lead-requests-meta-grid">
          <div className="lead-requests-meta-row">
            <span className="lead-requests-meta-label">Company</span>
            <span className="lead-requests-meta-value">{formatLabelValue(item.company, "No company")}</span>
          </div>
          <div className="lead-requests-meta-row">
            <span className="lead-requests-meta-label">Email</span>
            <span className="lead-requests-meta-value">{formatLabelValue(item.email)}</span>
          </div>
          <div className="lead-requests-meta-row">
            <span className="lead-requests-meta-label">Phone</span>
            <span className="lead-requests-meta-value">{formatLabelValue(item.phone)}</span>
          </div>
          <div className="lead-requests-meta-row">
            <span className="lead-requests-meta-label">Source</span>
            <span className="lead-requests-meta-value">{formatLabelValue(item.source || item.channel || item.leadSource, "Direct")}</span>
          </div>
        </div>

        <div className="lead-requests-assignment">
          <div className="assignment-lead-meta">
            Assigned by: {item.assignedBy?.name || item.assignedBy?.username || "System"}
          </div>
          <div className="assignment-lead-meta">
            Assigned to: {item.assignedTo?.name || item.assignedTo?.username || "Unassigned"}
          </div>
        </div>
      </div>

      {isManager && item.canAssign ? (
        <div className="assignment-manager-action lead-requests-card-action">
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
        <div className="assignment-manager-action assignment-manager-action-readonly lead-requests-card-action">
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
      ) : item.nextAction ? (
        <div className="lead-requests-card-action">
          {renderEmployeeAction(item)}
        </div>
      ) : null}

      {["ADMIN", "MANAGER", "EMPLOYEE"].includes(role) && ["qualified", "proposal", "proposal_sent"].includes(normalizeStatus(item.status)) ? (
        <div className="lead-requests-card-action">
          <button
            type="button"
            className="assignment-submit-btn lead-convert-btn"
            onClick={() => handleConvertToDeal(item)}
            disabled={Boolean(convertingLeadIds[item._id])}
          >
            {convertingLeadIds[item._id] ? "Converting..." : "Convert to Deal"}
          </button>
        </div>
      ) : null}

    </div>
  );

  const getWaitingForRestockNote = (item) => {
    if (item?.waitingForRestock) {
      return "Waiting for restock";
    }

    const noteSources = [
      String(item?.nextStep || "").trim(),
      String(item?.description || "").trim(),
      String(item?.reason || "").trim(),
    ].filter(Boolean);

    return noteSources.some((value) => /waiting for restock/i.test(value))
      ? "Waiting for restock"
      : "";
  };

  const renderDealCard = (item) => (
    <div key={item._id} className="lead-requests-card">
      <div className="lead-requests-card-header">
        <div className="lead-requests-card-identity">
          <div className="lead-requests-avatar">{getInitials(item.name)}</div>
          <div>
            <div className="assignment-lead-name">{item.name || "Unnamed Deal"}</div>
            <div className="lead-requests-subtitle">Deal</div>
          </div>
        </div>
        <div className="lead-requests-card-badges">
          <span className={`lead-status-badge ${getStatusClassName(normalizeDealStage(item.stage))}`}>
            {String(normalizeDealStage(item.stage) || "Unknown").replaceAll("_", " ").toUpperCase()}
          </span>
          <span className={`lead-assignment-badge ${String(item.status || "").toLowerCase() === "active" ? "assigned" : "unassigned"}`}>
            {String(item.status || "Unknown").toUpperCase()}
          </span>
        </div>
      </div>

      <div className="lead-requests-meta-grid">
        <div className="lead-requests-meta-row">
          <span className="lead-requests-meta-label">Company</span>
          <span className="lead-requests-meta-value">{formatLabelValue(item.company)}</span>
        </div>
        <div className="lead-requests-meta-row">
          <span className="lead-requests-meta-label">Amount</span>
          <span className="lead-requests-meta-value">{item.amount ? `INR ${Number(item.amount).toLocaleString()}` : "-"}</span>
        </div>
        <div className="lead-requests-meta-row">
          <span className="lead-requests-meta-label">Contact</span>
          <span className="lead-requests-meta-value">{formatLabelValue(item.contact || item.email)}</span>
        </div>
        <div className="lead-requests-meta-row">
          <span className="lead-requests-meta-label">Phone</span>
          <span className="lead-requests-meta-value">{formatLabelValue(item.phone)}</span>
        </div>
      </div>

      <div className="lead-requests-assignment">
        <div className="assignment-lead-meta">Assigned by: {item.assignedBy?.name || item.assignedBy?.username || "System"}</div>
        <div className="assignment-lead-meta">Assigned to: {item.assignedTo?.name || item.assignedTo?.username || "Unassigned"}</div>
      </div>
      {normalizeDealStage(item.stage) === "need_analysis" && getWaitingForRestockNote(item) ? (
        <div className="lead-request-waiting-note">{getWaitingForRestockNote(item)}</div>
      ) : null}

      {normalizeDealStage(item.stage) === "qualification" ? (
        <div className="deal-request-actions">
          <button
            type="button"
            className="assignment-submit-btn deal-request-action-btn move"
            disabled={Boolean(movingDealIds[item._id])}
            onClick={() => {
              if (!item?._id) return;
              moveDealStage(item, "need_analysis");
            }}
          >
            {movingDealIds[item._id] ? "Moving..." : "➡ Move to Need Analysis"}
          </button>
        </div>
      ) : null}

      {normalizeDealStage(item.stage) === "need_analysis" ? (
        <div className="deal-request-actions">
          <button
            type="button"
            className="assignment-submit-btn deal-request-action-btn move"
            onClick={() => {
              if (!item?._id) return;
              const params = new URLSearchParams({
                type: "meeting",
                create: "1",
                relatedType: "Deal",
                relatedId: String(item._id || ""),
                relatedName: String(item.name || "Deal"),
                source: "requests",
              });
              navigate(`/activities?${params.toString()}`);
            }}
          >
            Schedule Meeting
          </button>
        </div>
      ) : null}

      {normalizeDealStage(item.stage) === "value_proposition" ? (
        <div className="deal-request-actions">
          <button
            type="button"
            className="assignment-submit-btn deal-request-action-btn move"
            disabled={Boolean(movingDealIds[item._id])}
            onClick={() => {
              if (!item?._id) return;
              const params = new URLSearchParams({
                type: "meeting",
                create: "1",
                relatedType: "Deal",
                relatedId: String(item._id || ""),
                relatedName: String(item.name || "Deal"),
                source: "requests",
              });
              navigate(`/activities?${params.toString()}`);
            }}
          >
            Connect to Meeting
          </button>
        </div>
      ) : null}

      {normalizeDealStage(item.stage) === "proposal_price_quote" ? (
        <div className="deal-request-actions">
          <button
            type="button"
            className="assignment-submit-btn deal-request-action-btn move"
            onClick={() => {
              const params = new URLSearchParams({
                dealId: String(item._id || ""),
                dealName: String(item.name || "Deal"),
                company: String(item.company || ""),
                contact: String(item.contact || ""),
                email: String(item.email || ""),
                amount: String(item.amount || ""),
              });
              navigate(`/documents?${params.toString()}`);
            }}
          >
            Create Proposal
          </button>
        </div>
      ) : null}

      {normalizeDealStage(item.stage) === "negotiate" ? (
        <div className="deal-request-actions">
          <button
            type="button"
            className="assignment-submit-btn deal-request-action-btn move"
            onClick={() => {
              if (!item?._id) return;
              const params = new URLSearchParams({
                type: "meeting",
                create: "1",
                relatedType: "Deal",
                relatedId: String(item._id || ""),
                relatedName: String(item.name || "Deal"),
                source: "requests",
              });
              navigate(`/activities?${params.toString()}`);
            }}
          >
            Schedule Meeting
          </button>
        </div>
      ) : null}
    </div>
  );

  const renderContactCard = (item) => (
    <div key={item._id} className="lead-requests-card">
      <div className="lead-requests-card-header">
        <div className="lead-requests-card-identity">
          <div className="lead-requests-avatar">{getInitials(item.name)}</div>
          <div>
            <div className="assignment-lead-name">{item.name || "Unnamed Contact"}</div>
            <div className="lead-requests-subtitle">Contact</div>
          </div>
        </div>
        <div className="lead-requests-card-badges">
          <span className={`lead-assignment-badge ${String(item.status || "").toLowerCase() === "active" ? "assigned" : "unassigned"}`}>
            {String(item.status || "Unknown").toUpperCase()}
          </span>
        </div>
      </div>

      <div className="lead-requests-meta-grid">
        <div className="lead-requests-meta-row">
          <span className="lead-requests-meta-label">Company</span>
          <span className="lead-requests-meta-value">{formatLabelValue(item.company)}</span>
        </div>
        <div className="lead-requests-meta-row">
          <span className="lead-requests-meta-label">Email</span>
          <span className="lead-requests-meta-value">{formatLabelValue(item.email)}</span>
        </div>
        <div className="lead-requests-meta-row">
          <span className="lead-requests-meta-label">Phone</span>
          <span className="lead-requests-meta-value">{formatLabelValue(item.phone)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <div className="lead-requests-page">
          <div className="lead-requests-header">
            <div>
              <h2>Requests</h2>
              <p>
                Toggle between lead, deal, and contact requests from one workspace.
              </p>
            </div>
            <button type="button" className="assignment-submit-btn" onClick={() => navigate("/dashboard")}>
              Back To Dashboard
            </button>
          </div>

          <div className="request-type-toggle" role="tablist" aria-label="Request type tabs">
            {REQUEST_TYPE_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`request-type-toggle-btn ${activeRequestType === item.key ? "active" : ""}`}
                onClick={() => setActiveRequestType(item.key)}
                role="tab"
                aria-selected={activeRequestType === item.key}
              >
                {item.label}
                <span>
                  {item.key === "lead"
                    ? statusCounts.all
                    : item.key === "deal"
                      ? dealRequests.length
                      : contactRequests.length}
                </span>
              </button>
            ))}
          </div>

          {activeRequestType === "lead" ? (
            <>
              <div className="assignment-summary-grid lead-requests-summary-grid">
                <div className="assignment-summary-card">
                  <span>Total Requests</span>
                  <strong>{statusCounts.all}</strong>
                </div>
                <div className="assignment-summary-card">
                  <span>Call Actions</span>
                  <strong>{assignmentSnapshot?.summary?.callActions || 0}</strong>
                </div>
                <div className="assignment-summary-card">
                  <span>Meeting Actions</span>
                  <strong>{assignmentSnapshot?.summary?.meetingActions || 0}</strong>
                </div>
              </div>

              <div className="lead-requests-status-tabs" role="tablist" aria-label="Request status filter">
                {STATUS_FILTERS.map((status) => (
                  <button
                    key={status.key}
                    type="button"
                    className={`lead-requests-status-tab ${activeStatus === status.key ? "active" : ""}`}
                    onClick={() => setActiveStatus(status.key)}
                    role="tab"
                    aria-selected={activeStatus === status.key}
                  >
                    {status.label}
                    <span>{statusCounts[status.key] || 0}</span>
                  </button>
                ))}
              </div>

              {assignmentLoading ? (
                <div className="assignment-empty">Loading lead requests...</div>
              ) : filteredItems.length === 0 ? (
                <div className="assignment-empty">No records found for the selected status.</div>
              ) : (
                <div className="lead-requests-kanban">
                  {visibleColumns.map((column) => {
                    const columnItems = itemsByStatus[column.key] || [];
                    return (
                      <section key={column.key} className={`lead-requests-kanban-column ${column.key}`}>
                        <header className="lead-requests-kanban-header">
                          <span>{column.label}</span>
                          <strong>{columnItems.length}</strong>
                        </header>
                        <div className="lead-requests-kanban-body">
                          {columnItems.length === 0 ? (
                            <div className="lead-requests-kanban-empty">No records in this status.</div>
                          ) : (
                            columnItems.map((item) => renderLeadCard(item))
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </>
          ) : activeRequestType === "deal" ? (
            <>
              {auxiliaryLoading ? (
                <div className="assignment-empty">Loading deal requests...</div>
              ) : filteredDealRequests.length === 0 ? (
                <div className="assignment-empty">No deals found for the selected stage.</div>
              ) : (
                <>
                  <div className="lead-requests-status-tabs" role="tablist" aria-label="Deal stage filter">
                    {DEAL_STAGE_FILTERS.map((stage) => (
                      <button
                        key={stage.key}
                        type="button"
                        className={`lead-requests-status-tab ${activeDealStage === stage.key ? "active" : ""}`}
                        onClick={() => setActiveDealStage(stage.key)}
                        role="tab"
                        aria-selected={activeDealStage === stage.key}
                      >
                        {stage.label}
                        <span>{dealStageCounts[stage.key] || 0}</span>
                      </button>
                    ))}
                  </div>

                  <div className="lead-requests-kanban deal-requests-kanban">
                    {visibleDealColumns.map((column) => {
                      const columnItems = dealItemsByStage[column.key] || [];
                      return (
                        <section key={column.key} className={`lead-requests-kanban-column ${column.key}`}>
                          <header className="lead-requests-kanban-header">
                            <span>{column.label}</span>
                            <strong>{columnItems.length}</strong>
                          </header>
                          <div className="lead-requests-kanban-body">
                            {columnItems.length === 0 ? (
                              <div className="lead-requests-kanban-empty">No deals in this stage.</div>
                            ) : (
                              columnItems.map((item) => renderDealCard(item))
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {auxiliaryLoading ? (
                <div className="assignment-empty">Loading contact requests...</div>
              ) : contactRequests.length === 0 ? (
                <div className="assignment-empty">No contacts found.</div>
              ) : (
                <div className="lead-requests-list-grid">
                  {contactRequests.map((item) => renderContactCard(item))}
                </div>
              )}
            </>
          )}

          {showDealAdvanceModal ? (
            <div className="requests-modal-overlay" role="presentation">
              <div className="requests-modal-card" role="dialog" aria-modal="true" aria-label="Deal move details">
                <div className="requests-modal-header">
                  <h3>Move To Proposal</h3>
                  <button
                    type="button"
                    className="requests-modal-close"
                    onClick={() => {
                      setShowDealAdvanceModal(false);
                      setPendingDealAdvance(null);
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="requests-modal-body">
                  {pendingDealAdvance?.itemType === "product" ? (
                    <label className="requests-modal-field">
                      <span>Quantity *</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={dealAdvanceForm.quantity}
                        onChange={(event) => setDealAdvanceForm((prev) => ({ ...prev, quantity: event.target.value }))}
                        placeholder="Enter quantity"
                      />
                    </label>
                  ) : null}

                  {pendingDealAdvance?.itemType === "service" ? (
                    <label className="requests-modal-field">
                      <span>Plan / Billing Cycle *</span>
                      <select
                        value={dealAdvanceForm.billingCycle}
                        onChange={(event) => setDealAdvanceForm((prev) => ({ ...prev, billingCycle: event.target.value }))}
                      >
                        <option value="">Select billing cycle</option>
                        {BILLING_CYCLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {pendingDealAdvance?.itemType === "unknown" ? (
                    <>
                      <label className="requests-modal-field">
                        <span>Quantity</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={dealAdvanceForm.quantity}
                          onChange={(event) => setDealAdvanceForm((prev) => ({ ...prev, quantity: event.target.value }))}
                          placeholder="Enter quantity (for product deals)"
                        />
                      </label>
                      <label className="requests-modal-field">
                        <span>Plan / Billing Cycle</span>
                        <select
                          value={dealAdvanceForm.billingCycle}
                          onChange={(event) => setDealAdvanceForm((prev) => ({ ...prev, billingCycle: event.target.value }))}
                        >
                          <option value="">Select billing cycle (for service deals)</option>
                          {BILLING_CYCLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : null}

                  {!pendingDealAdvance?.itemType ? (
                    <p className="requests-modal-hint">
                      Continue to move this deal to Proposal stage.
                    </p>
                  ) : null}
                </div>
                <div className="requests-modal-footer">
                  <button
                    type="button"
                    className="requests-modal-cancel"
                    onClick={() => {
                      setShowDealAdvanceModal(false);
                      setPendingDealAdvance(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="assignment-submit-btn"
                    onClick={submitDealAdvance}
                    disabled={Boolean(movingDealIds[pendingDealAdvance?.dealId])}
                  >
                    {movingDealIds[pendingDealAdvance?.dealId] ? "Saving..." : "Save & Move"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default LeadRequests;

