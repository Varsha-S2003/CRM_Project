import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import "./Leads.css";
import "./Deals.css";
import RecordActivityPanel from "./RecordActivityPanel";
import { useCallback } from "react";
import DealFilterBuilder from "./components/DealFilterBuilder";

const ALL_DEALS_VIEW_ID = "__all_deals__";
const ACTIVE_DEALS_VIEW_ID = "__active_deals__";
const INACTIVE_DEALS_VIEW_ID = "__inactive_deals__";
const DEAL_DEFAULT_COLUMNS = ["name", "company", "amount", "contact", "stage", "closingDate"];

const stages = [
  { id: "qualification", name: "Qualification", color: "#2563eb" },
  { id: "need_analysis", name: "Need Analysis", color: "#0ea5e9" },
  { id: "value_proposition", name: "Value Proposition", color: "#6366f1" },
  { id: "proposal_price_quote", name: "Proposal/Price Quote", color: "#14b8a6" },
  { id: "negotiate", name: "Negotiate", color: "#f59e0b" },
  { id: "won", name: "Won", color: "#10b981" },
  { id: "lost", name: "Lost", color: "#ef4444" },
];

const DEFAULT_PROBABILITY_BY_STAGE = {
  qualification: "15",
  need_analysis: "35",
  value_proposition: "55",
  proposal_price_quote: "60",
  negotiate: "80",
  won: "100",
  lost: "0",
};

const dealTypeOptions = ["", "New Business", "Existing Business", "Renewal", "Upsell", "Other"];
const billingCycleOptions = [
  { value: "monthly", label: "Monthly" },
  { value: "6_months", label: "6 Months" },
  { value: "yearly", label: "Yearly" },
];
const salutations = ["", "Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];
const industries = ["", "Technology", "Manufacturing", "Finance", "Healthcare", "Retail", "Education", "Real Estate", "Other"];
const dealSources = ["", "Website", "Referral", "Social Media", "Email Campaign", "Cold Call", "Trade Show", "Other"];

const allowedTransitions = {
  "qualification": ["need_analysis", "lost"],
  "need_analysis": ["value_proposition", "qualification", "lost"],
  "value_proposition": ["proposal_price_quote", "need_analysis", "lost"],
  "proposal_price_quote": ["negotiate", "value_proposition", "lost"],
  "negotiate": ["won", "proposal_price_quote", "lost"],
  "won": [],
  "lost": []
};

const normalizeStageForUi = (stage) => {
  const normalized = String(stage || "").toLowerCase().replace(/\s+/g, "_");
  const mapping = {
    proposal: "proposal_price_quote",
    closed_won: "won",
    closed_lost: "lost",
  };

  return mapping[normalized] || normalized;
};

const getProductLabel = (product) => {
  if (!product) return "-";
  if (typeof product === "string") return product;
  return product.name || product.sku || "-";
};

const getItemType = (item) => {
  if (!item) return "";
  return item.type === "service" ? "service" : "product";
};

const normalizeDeal = (deal) => {
  const stage = normalizeStageForUi(deal.stage);
  const status = deal.status || (stage === "lost" ? "Inactive" : "Active");
  const reason = status === "Inactive" ? String(deal.reason || "").trim() : "";
  const probability =
    deal.probability === undefined || deal.probability === null || deal.probability === ""
      ? null
      : Number(deal.probability);
  const amount = Number(deal.amount || 0);
  const expectedRevenue =
    probability === null || Number.isNaN(probability)
      ? null
      : Number((deal.expectedRevenue ?? (amount * probability) / 100).toFixed(2));
  return {
    ...deal,
    stage,
    status,
    reason,
    probability: probability === null || Number.isNaN(probability) ? null : probability,
    expectedRevenue,
    closingDate: deal.closingDate ? new Date(deal.closingDate).toISOString().slice(0, 10) : "",
    nextStep: String(deal.nextStep || "").trim(),
    dealType: String(deal.dealType || "").trim(),
    leadSource: String(deal.leadSource || "").trim(),
    campaignSource: String(deal.campaignSource || "").trim(),
    description: String(deal.description || "").trim(),
  };
};

const parseOptionalNumberInput = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const getTodayDateInputValue = () => {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
};

function Deals() {
  const minDate = useMemo(() => getTodayDateInputValue(), []);
  const [deals, setDeals] = useState([]);
  const [products, setProducts] = useState([]);
  const [views, setViews] = useState([]);
  const [currentViewId, setCurrentViewId] = useState(null);
  const [dealStatusFilter, setDealStatusFilter] = useState("all");
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [isEditingSelectedDeal, setIsEditingSelectedDeal] = useState(false);
  const [editDealForm, setEditDealForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportView, setExportView] = useState("all");
  const [exportFieldScope, setExportFieldScope] = useState("custom");
  const [exportType, setExportType] = useState("csv");
  const [exportCharset, setExportCharset] = useState("utf-8");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [draggedDealId, setDraggedDealId] = useState(null);
  const [showLostReasonModal, setShowLostReasonModal] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [pendingStageChange, setPendingStageChange] = useState(null);
  const notificationRef = useRef(null);
  const createMenuRef = useRef(null);
  const viewDropdownRef = useRef(null);
  const [newDeal, setNewDeal] = useState({
    salutation: "",
    firstName: "",
    lastName: "",
    title: "",
    name: "",
    company: "",
    amount: "",
    contact: "",
    email: "",
    secondaryEmail: "",
    phone: "",
    mobile: "",
    website: "",
    industry: "",
    employeeCount: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    closingDate: "",
    probability: DEFAULT_PROBABILITY_BY_STAGE.qualification,
    expectedRevenue: "",
    nextStep: "",
    dealType: "",
    leadSource: "",
    campaignSource: "",
    description: "",
    product: "",
    quantity: "",
    billingCycle: "",
    stage: "qualification",
  });
  const exportViews = [{ id: "all", name: "All Deals" }, ...stages.map((stage) => ({ id: stage.id, name: `${stage.name} Deals` }))];
  const exportFieldPresets = {
    custom: ["name", "company", "product", "amount", "contact", "email", "phone", "stage", "closingDate", "probability", "expectedRevenue"],
    basic: ["name", "company", "product", "amount", "stage", "closingDate"],
    all: [
      "name",
      "company",
      "product",
      "amount",
      "contact",
      "email",
      "phone",
      "stage",
      "closingDate",
      "probability",
      "expectedRevenue",
      "nextStep",
      "dealType",
      "leadSource",
      "campaignSource",
      "description",
      "createdAt",
    ],
  };
  const formatDealDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };
  const exportFields = [
    { key: "name", label: "Deal Name", getValue: (deal) => deal.name || "-" },
    { key: "company", label: "Company", getValue: (deal) => deal.company || "-" },
    { key: "amount", label: "Amount", getValue: (deal) => Number(deal.amount || 0).toLocaleString() },
    { key: "contact", label: "Contact", getValue: (deal) => deal.contact || "-" },
    { key: "email", label: "Email", getValue: (deal) => deal.email || "-" },
    { key: "phone", label: "Alternative Contact", getValue: (deal) => deal.phone || "-" },
    { key: "stage", label: "Stage", getValue: (deal) => (deal.stage || "-").replaceAll("_", " ") },
    { key: "closingDate", label: "Closing Date", getValue: (deal) => deal.closingDate || "-" },
    { key: "probability", label: "Probability (%)", getValue: (deal) => (deal.probability ?? "-") },
    {
      key: "expectedRevenue",
      label: "Expected Revenue",
      getValue: (deal) =>
        deal.expectedRevenue === null || deal.expectedRevenue === undefined
          ? "-"
          : Number(deal.expectedRevenue).toLocaleString(),
    },
    { key: "nextStep", label: "Next Step", getValue: (deal) => deal.nextStep || "-" },
    { key: "dealType", label: "Deal Type", getValue: (deal) => deal.dealType || "-" },
    { key: "leadSource", label: "Lead Source", getValue: (deal) => deal.leadSource || "-" },
    { key: "campaignSource", label: "Campaign Source", getValue: (deal) => deal.campaignSource || "-" },
    { key: "description", label: "Description", getValue: (deal) => deal.description || "-" },
    { key: "product", label: "Product", getValue: (deal) => getProductLabel(deal.product) },
    { key: "createdAt", label: "Created On", getValue: (deal) => formatDealDate(deal.createdAt) },
  ];

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/items", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(res.data || []);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    }
  }, []);

  const fetchViews = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/deals/views", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setViews(res.data);
      setCurrentViewId((prev) => {
        if (
          prev &&
          (
            prev === ALL_DEALS_VIEW_ID ||
            prev === ACTIVE_DEALS_VIEW_ID ||
            prev === INACTIVE_DEALS_VIEW_ID ||
            res.data.some((view) => view._id === prev)
          )
        ) {
          return prev;
        }
        return ALL_DEALS_VIEW_ID;
      });
    } catch (err) {
      console.error("Failed to fetch deal views:", err);
    }
  }, []);

  const fetchNotifications = useCallback(() => {
    setNotifications((prev) => prev);
    setUnreadCount((prev) => prev);
    setShowNotifications((prev) => prev);
    setNotificationsLoading((prev) => prev);
  }, []);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const fetchDeals = useCallback(async (nextFilters = filters, nextStatus = dealStatusFilter) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const hasAdvancedFilters = Array.isArray(nextFilters?.conditions) && nextFilters.conditions.length > 0;

      if (hasAdvancedFilters) {
        const res = await axios.post(
          "http://localhost:5000/api/deals/filter",
          {
            filters: nextFilters,
            sort: { createdAt: -1 },
            limit: 100,
            skip: 0,
            status: nextStatus === "all" ? undefined : nextStatus,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setDeals((res.data || []).map((deal) => normalizeDeal(deal)));
        return;
      }

      const params = nextStatus === "all" ? {} : { status: nextStatus };
      const res = await axios.get("http://localhost:5000/api/deals", {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setDeals((res.data || []).map((deal) => normalizeDeal(deal)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [dealStatusFilter, filters]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target)) {
        setShowCreateMenu(false);
      }
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(event.target)) {
        setShowViewDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedDeal) {
      setIsEditingSelectedDeal(false);
      setEditDealForm(null);
      return;
    }

    setEditDealForm({
      name: selectedDeal.name || "",
      company: selectedDeal.company || "",
      contact: selectedDeal.contact || "",
      email: selectedDeal.email || "",
      phone: selectedDeal.phone || "",
      amount: selectedDeal.amount ?? "",
      closingDate: selectedDeal.closingDate || "",
      probability: selectedDeal.probability ?? "",
      expectedRevenue: selectedDeal.expectedRevenue ?? "",
      nextStep: selectedDeal.nextStep || "",
      dealType: selectedDeal.dealType || "",
      leadSource: selectedDeal.leadSource || "",
      campaignSource: selectedDeal.campaignSource || "",
      description: selectedDeal.description || "",
      product: selectedDeal.product?._id || selectedDeal.product || "",
      quantity: selectedDeal.quantity ?? "",
      billingCycle: selectedDeal.billingCycle || "",
    });
    setIsEditingSelectedDeal(false);
  }, [selectedDeal]);

  const filteredDeals = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return deals;
    return deals.filter((deal) =>
      [
        deal.name,
        deal.company,
        deal.contact,
        deal.email,
        deal.phone,
        getProductLabel(deal.product),
        deal.nextStep,
        deal.dealType,
        deal.leadSource,
        deal.campaignSource,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [deals, search]);

  const totalValue = useMemo(
    () => deals.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0),
    [deals]
  );

  const wonCount = useMemo(
    () => deals.filter((deal) => deal.stage === "won").length,
    [deals]
  );

  const lostCount = useMemo(
    () => deals.filter((deal) => deal.stage === "lost").length,
    [deals]
  );

  const openCount = deals.length - wonCount - lostCount;

  const getDealsByStage = (stageId) => filteredDeals.filter((deal) => deal.stage === stageId);

  const computedExpectedRevenue = useMemo(() => {
    const amount = parseOptionalNumberInput(newDeal.amount);
    const probability = parseOptionalNumberInput(newDeal.probability);
    if (amount === null || probability === null) {
      return "";
    }
    return Number(((amount * probability) / 100).toFixed(2)).toString();
  }, [newDeal.amount, newDeal.probability]);

  const selectedNewDealItemType = getItemType(products.find((item) => String(item._id) === String(newDeal.product)));
  const selectedEditDealItemType = getItemType(products.find((item) => String(item._id) === String(editDealForm?.product || "")));

  // Get stages that have deals matching the search
  const getStagesWithDeals = () => {
    if (!search.trim()) return stages;
    return stages.filter((stage) => getDealsByStage(stage.id).length > 0);
  };

  const openCreateModal = () => {
    setNewDeal({
      salutation: "",
      firstName: "",
      lastName: "",
      title: "",
      name: "",
      company: "",
      amount: "",
      contact: "",
      email: "",
      secondaryEmail: "",
      phone: "",
      mobile: "",
      website: "",
      industry: "",
      employeeCount: "",
      street: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      closingDate: "",
      probability: DEFAULT_PROBABILITY_BY_STAGE.qualification,
      expectedRevenue: "",
      nextStep: "",
      dealType: "",
      leadSource: "",
      campaignSource: "",
      description: "",
      product: "",
      quantity: "",
      billingCycle: "",
      stage: "qualification",
    });
    setShowModal(true);
    setShowCreateMenu(false);
  };

  const openImportModal = () => {
    setImportFileName("");
    setImportRows([]);
    setShowImportModal(true);
    setShowCreateMenu(false);
  };

  const openExportModal = () => {
    setExportView("all");
    setExportFieldScope("custom");
    setExportType("csv");
    setExportCharset("utf-8");
    setShowExportModal(true);
  };

  const normalizeHeader = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");

  const parseCsvLine = (line) => {
    const values = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          current += '"';
          i += 1;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values.map((value) => value.replace(/^"|"$/g, "").trim());
  };

  const mapCsvRowToDeal = (headers, rowValues) => {
    const row = headers.reduce((acc, header, index) => {
      acc[header] = rowValues[index] || "";
      return acc;
    }, {});

    const rawStage = String(row.stage || "qualification").trim().toLowerCase();
    const validStages = new Set(stages.map((stage) => stage.id));

    return {
      name: row.name || row.dealname || "",
      company: row.company || row.organization || "",
      amount: row.amount || row.dealvalue || row.value || 0,
      contact: row.contact || row.contactperson || row.customer || "",
      email: row.email || "",
      phone: row.phone || row.mobile || "",
      closingDate: row.closingdate || "",
      probability: row.probability || "",
      expectedRevenue: row.expectedrevenue || "",
      nextStep: row.nextstep || "",
      dealType: row.dealtype || "",
      leadSource: row.leadsource || row.source || "",
      campaignSource: row.campaignsource || row.campaign || "",
      description: row.description || "",
      product: "",
      quantity: "",
      billingCycle: "",
      stage: validStages.has(rawStage) ? rawStage : "qualification",
    };
  };

  const handleCsvFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        alert("CSV file must include a header row and at least one deal row.");
        return;
      }

      const headers = parseCsvLine(lines[0]).map(normalizeHeader);
      const rows = lines
        .slice(1)
        .map((line) => mapCsvRowToDeal(headers, parseCsvLine(line)))
        .filter((deal) => deal.name);

      if (rows.length === 0) {
        alert("No valid deals found in the selected CSV file.");
        return;
      }

      setImportFileName(file.name);
      setImportRows(rows);
    } catch (err) {
      console.error(err);
      alert("Failed to read CSV file");
    } finally {
      e.target.value = "";
    }
  };

  const submitNewDeal = async (e) => {
    e.preventDefault();
    try {
      const trimmedName = [String(newDeal.firstName || "").trim(), String(newDeal.lastName || "").trim()]
        .filter(Boolean)
        .join(" ")
        .trim();
      const trimmedSalutation = String(newDeal.salutation || "").trim();
      const trimmedFirstName = String(newDeal.firstName || "").trim();
      const trimmedLastName = String(newDeal.lastName || "").trim();
      const trimmedTitle = String(newDeal.title || "").trim();
      const trimmedCompany = String(newDeal.company || "").trim();
      const trimmedContact = String(newDeal.contact || "").trim();
      const trimmedEmail = String(newDeal.email || "").trim();
      const trimmedDealType = String(newDeal.dealType || "").trim();
      const trimmedDealSource = String(newDeal.leadSource || "").trim();
      const amountValue = parseOptionalNumberInput(newDeal.amount);
      const closingDateValue = String(newDeal.closingDate || "").trim();
      const probabilityValue = parseOptionalNumberInput(newDeal.probability);

      if (!trimmedSalutation) {
        alert("Salutation is required");
        return;
      }
      if (!trimmedName) {
        alert("First Name or Last Name is required");
        return;
      }
      if (!trimmedFirstName) {
        alert("First Name is required");
        return;
      }
      if (!trimmedLastName) {
        alert("Last Name is required");
        return;
      }
      if (!trimmedTitle) {
        alert("Title is required");
        return;
      }
      if (amountValue === null || amountValue <= 0) {
        alert("Amount (Deal Value) is required and must be greater than 0");
        return;
      }
      if (!trimmedCompany) {
        alert("Company is required");
        return;
      }
      if (!trimmedContact) {
        alert("Contact Person is required");
        return;
      }
      if (!trimmedEmail) {
        alert("Email is required");
        return;
      }
    if (!String(newDeal.product || "").trim()) {
      alert("Product is required");
      return;
    }
    if (selectedNewDealItemType === "product") {
      const quantityValue = parseOptionalNumberInput(newDeal.quantity);
      if (quantityValue === null || quantityValue < 0) {
        alert("Quantity is required for selected products");
        return;
      }
    }
    if (selectedNewDealItemType === "service") {
      if (!String(newDeal.billingCycle || "").trim()) {
        alert("Plan / Billing Cycle is required for selected services");
        return;
      }
    }
    if (!trimmedDealType) {
      alert("Deal Type is required");
      return;
    }
      if (!trimmedDealSource) {
        alert("Deal Source is required");
        return;
      }
      if (!closingDateValue) {
        alert("Closing Date is required");
        return;
      }
      if (probabilityValue !== null && (probabilityValue < 0 || probabilityValue > 100)) {
        alert("Probability must be between 0 and 100");
        return;
      }

      const token = localStorage.getItem("token");
      const expectedRevenueValue =
        probabilityValue === null
          ? parseOptionalNumberInput(newDeal.expectedRevenue)
          : Number(((amountValue * probabilityValue) / 100).toFixed(2));
      const res = await axios.post(
        "http://localhost:5000/api/deals",
        {
          ...newDeal,
          name: trimmedName,
          amount: amountValue,
          probability: probabilityValue,
      expectedRevenue: expectedRevenueValue,
      closingDate: newDeal.closingDate || null,
      product: newDeal.product || null,
      quantity: selectedNewDealItemType === "product" ? parseOptionalNumberInput(newDeal.quantity) : undefined,
      billingCycle: selectedNewDealItemType === "service" ? newDeal.billingCycle || "" : undefined,
    },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDeals((prev) => [normalizeDeal(res.data), ...prev]);
      setShowModal(false);
    } catch (err) {
      console.error(err);
      const errorMessage =
        err.response?.data?.message ||
        (typeof err.response?.data === "string" ? err.response.data : "") ||
        err.message ||
        "Failed to create deal";
      alert(errorMessage);
    }
  };

  const handleImportDeals = async () => {
    if (!importRows.length) {
      alert("Select a CSV file with deal data first.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5000/api/deals/bulk",
        { deals: importRows },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDeals((prev) => [...(res.data.deals || []).map((deal) => normalizeDeal(deal)), ...prev]);
      setShowImportModal(false);
      setImportRows([]);
      setImportFileName("");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to import deals from CSV");
    }
  };

  const updateStage = async (dealId, stageId, reason = "") => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.put(
        `http://localhost:5000/api/deals/${dealId}/stage`,
        { stage: stageId, reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const normalizedDeal = normalizeDeal(res.data);
      setDeals((prev) =>
        prev.map((deal) => (deal._id === dealId ? normalizedDeal : deal))
      );
      setSelectedDeal((prev) => (prev && prev._id === dealId ? normalizedDeal : prev));
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || err.message || "Failed to update deal stage");
    }
  };

  const requestStageChange = (dealId, stageId) => {
    const currentDeal = deals.find((deal) => deal._id === dealId);
    if (!currentDeal) return;

    const currentStage = currentDeal.stage;
    if (
      currentStage !== stageId &&
      (!allowedTransitions[currentStage] || !allowedTransitions[currentStage].includes(stageId))
    ) {
      alert(`Invalid stage transition: from "${currentStage.replace(/_/g, " ")}" to "${stages.find((s) => s.id === stageId)?.name || stageId}" not allowed`);
      return;
    }

    if (stageId === "lost") {
      if (selectedDeal && selectedDeal._id === dealId) {
        setSelectedDeal(null);
      }
      setPendingStageChange({ dealId, stageId });
      setLostReason(currentDeal.reason || "");
      setShowLostReasonModal(true);
      return;
    }

    updateStage(dealId, stageId, "");
  };

  const submitLostReason = async () => {
    const reason = lostReason.trim();
    if (!reason) {
      alert("Reason is required when moving a deal to Closed Lost.");
      return;
    }
    if (!pendingStageChange) return;

    await updateStage(pendingStageChange.dealId, pendingStageChange.stageId, reason);
    setPendingStageChange(null);
    setLostReason("");
    setShowLostReasonModal(false);
  };

  const handleDragStart = (event, deal) => {
    if (deal.stage === "lost") {
      event.preventDefault();
      return;
    }
    setDraggedDealId(deal._id);
  };

  const handleStageDrop = (stageId) => {
    if (!draggedDealId) return;
    requestStageChange(draggedDealId, stageId);
    setDraggedDealId(null);
  };

  const deleteDeal = async (dealId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:5000/api/deals/${dealId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeals((prev) => prev.filter((deal) => deal._id !== dealId));
      setSelectedDeal(null);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || err.message || "Failed to delete deal");
    }
  };

  const getExportDeals = () => {
    if (exportView === "all") return filteredDeals;
    return filteredDeals.filter((deal) => deal.stage === exportView);
  };

  const getSelectedExportFields = () => {
    const allowedFields = new Set(exportFieldPresets[exportFieldScope] || exportFieldPresets.custom);
    return exportFields.filter((field) => allowedFields.has(field.key));
  };

  const formatFilterChipValue = (key, value) => {
    if (key === "conditions" && Array.isArray(value)) {
      if (value.length === 0) return "No conditions";

      return value
        .map((condition) => {
          if (!condition || typeof condition !== "object") return String(condition);

          const field = condition.field || "field";
          const operator = condition.operator || "operator";
          const conditionValue =
            condition.operator === "between"
              ? [condition.from, condition.to].filter(Boolean).join(" to ")
              : condition.value;

          return `${field} ${operator} ${conditionValue || ""}`.trim();
        })
        .join(", ");
    }

    if (value && typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  };

  const loadView = useCallback((viewId) => {
    if (viewId === ALL_DEALS_VIEW_ID) {
      const nextFilters = {};
      setCurrentViewId(ALL_DEALS_VIEW_ID);
      setDealStatusFilter("all");
      setShowViewDropdown(false);
      setFilters(nextFilters);
      fetchDeals(nextFilters, "all");
      return;
    }

    if (viewId === ACTIVE_DEALS_VIEW_ID) {
      const nextFilters = {};
      setCurrentViewId(ACTIVE_DEALS_VIEW_ID);
      setDealStatusFilter("Active");
      setShowViewDropdown(false);
      setFilters(nextFilters);
      fetchDeals(nextFilters, "Active");
      return;
    }

    if (viewId === INACTIVE_DEALS_VIEW_ID) {
      const nextFilters = {};
      setCurrentViewId(INACTIVE_DEALS_VIEW_ID);
      setDealStatusFilter("Inactive");
      setShowViewDropdown(false);
      setFilters(nextFilters);
      fetchDeals(nextFilters, "Inactive");
      return;
    }

    const view = views.find((item) => item._id === viewId);
    if (view) {
      const nextFilters = view.filters || {};
      setCurrentViewId(viewId);
      setDealStatusFilter("all");
      setShowViewDropdown(false);
      setFilters(nextFilters);
      fetchDeals(nextFilters, "all");
    }
  }, [fetchDeals, views]);

  const saveView = async ({ mode = "update" } = {}) => {
    try {
      const token = localStorage.getItem("token");
      const activeView = views.find((view) => view._id === currentViewId);
      const shouldCreate = mode === "create" || !activeView;

      let name = activeView?.name || "My Deals View";
      if (shouldCreate) {
        const promptedName = window.prompt("Enter a view name", name);
        if (!promptedName) return;
        name = promptedName.trim();
        if (!name) return;
        if (name.toLowerCase() === "all deals") {
          window.alert('The name "All Deals" is reserved. Use a different view name.');
          return;
        }
      }

      const payload = {
        name,
        filters,
        sort: { createdAt: -1 },
        columns: DEAL_DEFAULT_COLUMNS,
        visibility: activeView?.visibility || "private",
      };

      const res = shouldCreate
        ? await axios.post("http://localhost:5000/api/deals/views", payload, {
            headers: { Authorization: `Bearer ${token}` },
          })
        : await axios.put(`http://localhost:5000/api/deals/views/${activeView._id}`, payload, {
            headers: { Authorization: `Bearer ${token}` },
          });

      if (res.data?._id) {
        setViews((prev) => {
          if (shouldCreate) {
            const withoutDuplicate = prev.filter((view) => view._id !== res.data._id);
            return [res.data, ...withoutDuplicate];
          }
          return prev.map((view) => (view._id === res.data._id ? res.data : view));
        });
        setCurrentViewId(res.data._id);
      }

      window.alert(shouldCreate ? "View saved." : "View updated.");
    } catch (err) {
      console.error("Failed to save deal view:", err);
      window.alert(err.response?.data?.message || "Failed to save view");
    }
  };

  const saveEditedDeal = async () => {
    if (!selectedDeal || !editDealForm) return;

    const trimmedName = String(editDealForm.name || "").trim();
    const trimmedCompany = String(editDealForm.company || "").trim();
    const trimmedContact = String(editDealForm.contact || "").trim();
    const trimmedEmail = String(editDealForm.email || "").trim();
    const amountValue = parseOptionalNumberInput(editDealForm.amount);
    const closingDateValue = String(editDealForm.closingDate || "").trim();
    const probabilityValue = parseOptionalNumberInput(editDealForm.probability);
    const expectedRevenueValue = parseOptionalNumberInput(editDealForm.expectedRevenue);

    if (!trimmedName) {
      alert("Deal Name is required");
      return;
    }
    if (!trimmedCompany) {
      alert("Company is required");
      return;
    }
    if (!trimmedContact) {
      alert("Contact Person is required");
      return;
    }
    if (!trimmedEmail) {
      alert("Email is required");
      return;
    }
    if (!String(editDealForm.product || "").trim()) {
      alert("Product is required");
      return;
    }
    if (selectedEditDealItemType === "product") {
      const quantityValue = parseOptionalNumberInput(editDealForm.quantity);
      if (quantityValue === null || quantityValue < 0) {
        alert("Quantity is required for selected products");
        return;
      }
    }
    if (selectedEditDealItemType === "service") {
      if (!String(editDealForm.billingCycle || "").trim()) {
        alert("Plan / Billing Cycle is required for selected services");
        return;
      }
    }
    if (amountValue === null || amountValue <= 0) {
      alert("Amount (Deal Value) is required and must be greater than 0");
      return;
    }
    if (!closingDateValue) {
      alert("Closing Date is required");
      return;
    }
    if (probabilityValue !== null && (probabilityValue < 0 || probabilityValue > 100)) {
      alert("Probability must be between 0 and 100");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const payload = {
        name: trimmedName,
        company: trimmedCompany,
        contact: trimmedContact,
        email: trimmedEmail,
        phone: String(editDealForm.phone || "").trim(),
        amount: amountValue,
        closingDate: closingDateValue,
        probability: probabilityValue,
      expectedRevenue: probabilityValue === null ? expectedRevenueValue : undefined,
      nextStep: String(editDealForm.nextStep || "").trim(),
      dealType: String(editDealForm.dealType || "").trim(),
      leadSource: String(editDealForm.leadSource || "").trim(),
      campaignSource: String(editDealForm.campaignSource || "").trim(),
      description: String(editDealForm.description || "").trim(),
      product: editDealForm.product || null,
      quantity: selectedEditDealItemType === "product" ? parseOptionalNumberInput(editDealForm.quantity) : undefined,
      billingCycle: selectedEditDealItemType === "service" ? editDealForm.billingCycle || "" : undefined,
    };

      const res = await axios.put(`http://localhost:5000/api/deals/${selectedDeal._id}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const normalized = normalizeDeal(res.data);
      setDeals((prev) => prev.map((deal) => (deal._id === normalized._id ? normalized : deal)));
      setSelectedDeal(normalized);
      setIsEditingSelectedDeal(false);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to update deal");
    }
  };

  const deleteView = async (viewId = currentViewId) => {
    const activeView = views.find((view) => view._id === viewId);
    if (!activeView) {
      window.alert("Select a saved view to delete.");
      return;
    }

    const confirmed = window.confirm(`Delete saved view "${activeView.name}"?`);
    if (!confirmed) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:5000/api/deals/views/${activeView._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setViews((prev) => prev.filter((view) => view._id !== activeView._id));
      loadView(ALL_DEALS_VIEW_ID);
      setShowViewDropdown(false);
      window.alert("View deleted.");
    } catch (err) {
      console.error("Failed to delete deal view:", err);
      window.alert(err.response?.data?.message || "Failed to delete view");
    }
  };

  const visibleSavedViews = views.filter((view) => view.name !== "All Deals");
  const activeViewName =
    currentViewId === ACTIVE_DEALS_VIEW_ID
      ? "Active Deals"
      : currentViewId === INACTIVE_DEALS_VIEW_ID
        ? "Inactive Deals"
        : currentViewId === ALL_DEALS_VIEW_ID
          ? "All Deals"
          : visibleSavedViews.find((view) => view._id === currentViewId)?.name || "All Deals";

  useEffect(() => {
    if (currentViewId === ALL_DEALS_VIEW_ID && dealStatusFilter === "all" && Object.keys(filters).length > 0) {
      setFilters({});
    }
  }, [currentViewId, dealStatusFilter, filters]);

  const sanitizeFileName = (value) =>
    String(value || "deals-export")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const downloadBlob = (blob, fileName) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const escapeCsvValue = (value) => {
    const stringValue = String(value ?? "");
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const buildCsvBlob = (rows, fields) => {
    const csvLines = [
      fields.map((field) => escapeCsvValue(field.label)).join(","),
      ...rows.map((deal) => fields.map((field) => escapeCsvValue(field.getValue(deal))).join(",")),
    ];
    const csvText = csvLines.join("\r\n");
    const payload = exportCharset === "utf-8" ? `\uFEFF${csvText}` : csvText;
    return new Blob([payload], { type: `text/csv;charset=${exportCharset}` });
  };

  const escapeXml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const getExcelColumnName = (index) => {
    let columnIndex = index + 1;
    let columnName = "";
    while (columnIndex > 0) {
      const remainder = (columnIndex - 1) % 26;
      columnName = String.fromCharCode(65 + remainder) + columnName;
      columnIndex = Math.floor((columnIndex - 1) / 26);
    }
    return columnName;
  };

  const buildZip = (files) => {
    const encoder = new TextEncoder();
    const crcTable = new Uint32Array(256).map((_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      }
      return value >>> 0;
    });

    const crc32 = (bytes) => {
      let crc = 0xffffffff;
      for (let i = 0; i < bytes.length; i += 1) {
        crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
      }
      return (crc ^ 0xffffffff) >>> 0;
    };

    const createDateParts = (date) => {
      const year = Math.max(date.getFullYear(), 1980);
      const dosTime =
        ((date.getHours() & 0x1f) << 11) |
        ((date.getMinutes() & 0x3f) << 5) |
        Math.floor(date.getSeconds() / 2);
      const dosDate =
        (((year - 1980) & 0x7f) << 9) |
        (((date.getMonth() + 1) & 0xf) << 5) |
        (date.getDate() & 0x1f);
      return { dosDate, dosTime };
    };

    const writeUint16 = (view, offset, value) => view.setUint16(offset, value, true);
    const writeUint32 = (view, offset, value) => view.setUint32(offset, value, true);

    let localOffset = 0;
    const localParts = [];
    const centralParts = [];

    files.forEach((file) => {
      const fileNameBytes = encoder.encode(file.name);
      const fileBytes = encoder.encode(file.content);
      const fileDate = createDateParts(file.date || new Date());
      const fileCrc = crc32(fileBytes);

      const localHeader = new Uint8Array(30 + fileNameBytes.length);
      const localView = new DataView(localHeader.buffer);
      writeUint32(localView, 0, 0x04034b50);
      writeUint16(localView, 4, 20);
      writeUint16(localView, 6, 0);
      writeUint16(localView, 8, 0);
      writeUint16(localView, 10, fileDate.dosTime);
      writeUint16(localView, 12, fileDate.dosDate);
      writeUint32(localView, 14, fileCrc);
      writeUint32(localView, 18, fileBytes.length);
      writeUint32(localView, 22, fileBytes.length);
      writeUint16(localView, 26, fileNameBytes.length);
      writeUint16(localView, 28, 0);
      localHeader.set(fileNameBytes, 30);

      const centralHeader = new Uint8Array(46 + fileNameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      writeUint32(centralView, 0, 0x02014b50);
      writeUint16(centralView, 4, 20);
      writeUint16(centralView, 6, 20);
      writeUint16(centralView, 8, 0);
      writeUint16(centralView, 10, 0);
      writeUint16(centralView, 12, fileDate.dosTime);
      writeUint16(centralView, 14, fileDate.dosDate);
      writeUint32(centralView, 16, fileCrc);
      writeUint32(centralView, 20, fileBytes.length);
      writeUint32(centralView, 24, fileBytes.length);
      writeUint16(centralView, 28, fileNameBytes.length);
      writeUint16(centralView, 30, 0);
      writeUint16(centralView, 32, 0);
      writeUint16(centralView, 34, 0);
      writeUint16(centralView, 36, 0);
      writeUint32(centralView, 38, 0);
      writeUint32(centralView, 42, localOffset);
      centralHeader.set(fileNameBytes, 46);

      localParts.push(localHeader, fileBytes);
      centralParts.push(centralHeader);
      localOffset += localHeader.length + fileBytes.length;
    });

    const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    writeUint32(endView, 0, 0x06054b50);
    writeUint16(endView, 4, 0);
    writeUint16(endView, 6, 0);
    writeUint16(endView, 8, files.length);
    writeUint16(endView, 10, files.length);
    writeUint32(endView, 12, centralDirectorySize);
    writeUint32(endView, 16, localOffset);
    writeUint16(endView, 20, 0);

    return new Blob([...localParts, ...centralParts, endRecord], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  };

  const buildXlsxBlob = (rows, fields) => {
    const now = new Date();
    const isoNow = now.toISOString();
    const sheetRows = [
      fields.map((field) => field.label),
      ...rows.map((deal) => fields.map((field) => field.getValue(deal))),
    ];

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetRows
      .map(
        (row, rowIndex) => `<row r="${rowIndex + 1}">
      ${row
        .map(
          (value, cellIndex) =>
            `<c r="${getExcelColumnName(cellIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
        )
        .join("")}
    </row>`
      )
      .join("")}
  </sheetData>
</worksheet>`;

    const files = [
      {
        name: "[Content_Types].xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
      },
      {
        name: "_rels/.rels",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
      },
      {
        name: "docProps/app.xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>CRM Project</Application>
</Properties>`,
      },
      {
        name: "docProps/core.xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Deals Export</dc:title>
  <dc:creator>CRM Project</dc:creator>
  <cp:lastModifiedBy>CRM Project</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${isoNow}</dcterms:modified>
</cp:coreProperties>`,
      },
      {
        name: "xl/workbook.xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Deals" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
      },
      {
        name: "xl/_rels/workbook.xml.rels",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
      },
      {
        name: "xl/styles.xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`,
      },
      {
        name: "xl/worksheets/sheet1.xml",
        content: sheetXml,
      },
    ];

    return buildZip(files);
  };

  const escapePdfText = (value) =>
    String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

  const buildPdfBlob = (rows, fields) => {
    const columnWidths = fields.map((field) => Math.max(field.label.length, 14));
    const lines = [
      `Deal Export - ${exportViews.find((view) => view.id === exportView)?.name || "All Deals"}`,
      "",
      [...fields.map((field, index) => field.label.padEnd(columnWidths[index], " "))].join(" | "),
      [...fields.map((_, index) => "-".repeat(columnWidths[index]))].join("-+-"),
      ...rows.map((deal) =>
        fields
          .map((field, index) => String(field.getValue(deal)).replace(/\s+/g, " ").slice(0, columnWidths[index]).padEnd(columnWidths[index], " "))
          .join(" | ")
      ),
    ];

    const linesPerPage = 38;
    const pageChunks = [];
    for (let index = 0; index < lines.length; index += linesPerPage) {
      pageChunks.push(lines.slice(index, index + linesPerPage));
    }

    const fontObjectId = 3;
    const pageObjectIds = pageChunks.map((_, index) => 5 + index * 2);
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    ];

    pageChunks.forEach((pageLines, index) => {
      const contentStream = `BT
/F1 9 Tf
36 806 Td
12 TL
${pageLines.map((line) => `(${escapePdfText(line)}) Tj`).join("\nT*\n")}
ET`;
      const contentObjectId = 4 + index * 2;
      objects.push(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`);
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
      );
    });

    const pdfParts = ["%PDF-1.4\n"];
    const offsets = [0];
    let runningLength = pdfParts[0].length;

    objects.forEach((object, index) => {
      offsets.push(runningLength);
      const objectText = `${index + 1} 0 obj\n${object}\nendobj\n`;
      pdfParts.push(objectText);
      runningLength += objectText.length;
    });

    const xrefOffset = runningLength;
    pdfParts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
    for (let index = 1; index < offsets.length; index += 1) {
      pdfParts.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
    }
    pdfParts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    return new Blob(pdfParts, { type: "application/pdf" });
  };

  const handleExportDeals = () => {
    const exportRows = getExportDeals();
    const fields = getSelectedExportFields();

    if (!exportRows.length) {
      alert("No deal records are available for the selected export view.");
      return;
    }

    const fileStem = sanitizeFileName(`deals-${exportView}-${new Date().toISOString().slice(0, 10)}`);

    try {
      if (exportType === "csv") {
        downloadBlob(buildCsvBlob(exportRows, fields), `${fileStem}.csv`);
      } else if (exportType === "xlsx") {
        downloadBlob(buildXlsxBlob(exportRows, fields), `${fileStem}.xlsx`);
      } else {
        downloadBlob(buildPdfBlob(exportRows, fields), `${fileStem}.pdf`);
      }
      setShowExportModal(false);
    } catch (error) {
      console.error(error);
      alert("Failed to export deal records.");
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content leads-page">
        <div className="leads-fixed-top">
          <div className="leads-header-section">
            <div className="leads-header-left">
              <h1>Deals</h1>
              <p>Manage the complete deal pipeline from qualification to closure</p>
            </div>
            <div className="leads-header-right">
              <div className="create-lead-menu" ref={createMenuRef}>
                <button className="btn-primary" onClick={() => setShowCreateMenu((prev) => !prev)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Create Deal
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                {showCreateMenu && (
                  <div className="create-lead-dropdown">
                    <button type="button" className="create-lead-dropdown-item" onClick={openCreateModal}>
                      Add Deal
                    </button>
                    <button type="button" className="create-lead-dropdown-item" onClick={openImportModal}>
                      Import from CSV
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="leads-stats-row">
            <div className="stat-card-zoho">
              <div className="stat-content">
                <span className="stat-value">{deals.length}</span>
                <span className="stat-label">Total Deals</span>
              </div>
            </div>
            <div className="stat-card-zoho">
              <div className="stat-content">
                <span className="stat-value">{openCount}</span>
                <span className="stat-label">Open Deals</span>
              </div>
            </div>
            <div className="stat-card-zoho">
              <div className="stat-content">
                <span className="stat-value">{wonCount}</span>
                <span className="stat-label">Won Deals</span>
              </div>
            </div>
            <div className="stat-card-zoho">
              <div className="stat-content">
                <span className="stat-value">${totalValue.toLocaleString()}</span>
                <span className="stat-label">Pipeline Value</span>
              </div>
            </div>
          </div>

          <div className="leads-toolbar-zoho">
            <div className="search-box-zoho deal-search-box">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search deals by name, company, contact, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSearch(e.currentTarget.value);
                  }
                }}
              />
            </div>
            <div className="toolbar-actions deal-toolbar-actions">
              <div className="views-toolbar deal-views-toolbar">
                <div className="lead-view-select-wrap" ref={viewDropdownRef}>
                  <button
                    type="button"
                    className="lead-view-select-button"
                    onClick={() => setShowViewDropdown((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={showViewDropdown}
                  >
                    <span>{activeViewName}</span>
                    <span className={`lead-view-select-caret ${showViewDropdown ? "open" : ""}`}>{"\u2304"}</span>
                  </button>

                  {showViewDropdown && (
                    <div className="lead-view-dropdown-menu" role="menu" aria-label="Deal views">
                      <button
                        type="button"
                        className={`lead-view-dropdown-item ${currentViewId === ALL_DEALS_VIEW_ID ? "active" : ""}`}
                        onClick={() => {
                          loadView(ALL_DEALS_VIEW_ID);
                          setShowViewDropdown(false);
                        }}
                      >
                        <span>All Deals</span>
                      </button>

                      <button
                        type="button"
                        className={`lead-view-dropdown-item ${currentViewId === ACTIVE_DEALS_VIEW_ID ? "active" : ""}`}
                        onClick={() => loadView(ACTIVE_DEALS_VIEW_ID)}
                      >
                        <span>Active Deals</span>
                      </button>

                      <button
                        type="button"
                        className={`lead-view-dropdown-item ${currentViewId === INACTIVE_DEALS_VIEW_ID ? "active" : ""}`}
                        onClick={() => loadView(INACTIVE_DEALS_VIEW_ID)}
                      >
                        <span>Inactive Deals</span>
                      </button>

                      {visibleSavedViews.map((view) => (
                        <div
                          key={view._id}
                          className={`lead-view-dropdown-item ${currentViewId === view._id ? "active" : ""}`}
                          role="menuitem"
                        >
                          <button
                            type="button"
                            className="lead-view-dropdown-name"
                            onClick={() => {
                              loadView(view._id);
                              setShowViewDropdown(false);
                            }}
                          >
                            {view.name}
                          </button>
                          <button
                            type="button"
                            className="lead-view-dropdown-delete"
                            title={`Delete ${view.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteView(view._id);
                            }}
                          >
                            {"\u{1F5D1}"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <select
                    className="lead-view-select"
                    style={{ display: "none" }}
                    value={currentViewId || ALL_DEALS_VIEW_ID}
                    onChange={(e) => loadView(e.target.value)}
                    aria-label="Deal views"
                  >
                    <option value={ALL_DEALS_VIEW_ID}>All Deals</option>
                    <option value={ACTIVE_DEALS_VIEW_ID}>Active Deals</option>
                    <option value={INACTIVE_DEALS_VIEW_ID}>Inactive Deals</option>
                    {views
                      .filter((view) => view.name !== "All Deals")
                      .map((view) => (
                        <option key={view._id} value={view._id}>
                          {view.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              {false && <div className="notification-bell" ref={notificationRef}>
                <button 
                  className="notification-btn" 
                  onClick={() => setShowNotifications(prev => !prev)}
                  title="Notifications"
                >
                  🔔
                  {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                  )}
                </button>
                {showNotifications && (
                  <div className="notification-dropdown">
                    <div className="notification-header">
                      <h4>Notifications ({unreadCount})</h4>
                      <button onClick={async () => {
                        if (notifications.some(n => !n.isRead)) {
                          const unreadIds = notifications.filter(n => !n.isRead).map(n => n._id);
                          try {
                            const token = localStorage.getItem("token");
                            await axios.patch(`http://localhost:5000/api/deals/notifications/${unreadIds.join(',')}/read`, {}, {
                              headers: { Authorization: `Bearer ${token}` }
                            });
                            fetchNotifications();
                          } catch (err) {
                            console.error('Mark read error:', err);
                          }
                        }
                      }}>Mark all read</button>
                    </div>
                    {notificationsLoading ? (
                      <div>Loading...</div>
                    ) : notifications.length === 0 ? (
                      <div>No notifications</div>
                    ) : (
                      <div className="notification-list">
                        {notifications.slice(0, 10).map((notif) => (
                          <div 
                            key={notif._id} 
                            className={`notification-item ${notif.isRead ? 'read' : 'unread'}`}
                            onClick={async () => {
                              if (!notif.isRead) {
                                try {
                                  const token = localStorage.getItem("token");
                                  await axios.patch(`http://localhost:5000/api/deals/notifications/${notif._id}/read`, {}, {
                                    headers: { Authorization: `Bearer ${token}` }
                                  });
                                  fetchNotifications();
                                } catch (err) {
                                  console.error('Mark read error:', err);
                                }
                              }
                            }}
                          >
                            <div className="notification-message">
                              {notif.message}
                              {notif.dealId && (
                                <span className="deal-link" style={{cursor: 'pointer', color: '#3b82f6'}} onClick={(e) => {
                                  e.stopPropagation();
                                  const localDeal = deals.find((deal) => deal._id === notif.dealId?._id);
                                  setSelectedDeal(localDeal || normalizeDeal(notif.dealId || {}));
                                  setShowNotifications(false);
                                }}>
                                  Deal: {notif.dealId.name}
                                </span>
                              )}
                            </div>
                            <div className="notification-time">
                              {new Date(notif.createdAt).toLocaleString()}
                            </div>
                          </div>
                        ))}
                        {notifications.length > 10 && (
                          <div className="notification-footer">
                            +{notifications.length - 10} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>}
              <button className="btn-filter" type="button" onClick={() => setShowFilterModal(true)}>Filters</button>
              <button className="btn-filter" type="button" onClick={() => saveView({ mode: "update" })}>Save View</button>
              <button className="btn-filter" type="button" onClick={openExportModal}>Export</button>
            </div>
          </div>
        </div>

        <div className="leads-scroll-content">
          {Object.keys(filters).length > 0 && (
            <div className="filter-chips">
              {Object.entries(filters)
                .filter(([key]) => key !== "logic")
                .map(([key, value]) => (
                  <span key={key} className="filter-chip">
                    {key}: {formatFilterChipValue(key, value)}
                    <button
                      type="button"
                      onClick={() => {
                        setFilters({});
                        fetchDeals({});
                      }}
                    >
                      x
                    </button>
                  </span>
                ))}
            </div>
          )}
          {loading ? (
            <p className="dashboard-subtitle">Loading deals...</p>
          ) : (
          <div className="kanban-board-zoho">
            {getStagesWithDeals().map((stage) => (
              <div key={stage.id} className="kanban-column-zoho">
                <div className="column-header-zoho" style={{ borderTopColor: stage.color }}>
                  <div className="column-title-zoho">
                    <span className="column-dot" style={{ backgroundColor: stage.color }}></span>
                    <h3>{stage.name}</h3>
                  </div>
                  <span className="lead-count-zoho">{getDealsByStage(stage.id).length}</span>
                </div>
                <div className="column-content-zoho">
                <div
                  className="column-drop-zone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleStageDrop(stage.id)}
                >
                  {getDealsByStage(stage.id).map((deal) => (
                    <div
                      key={deal._id}
                      className={`kanban-card-zoho ${deal.status === "Inactive" ? "kanban-card-inactive" : ""}`}
                      draggable={deal.stage !== "lost"}
                      onDragStart={(event) => handleDragStart(event, deal)}
                      onDragEnd={() => setDraggedDealId(null)}
                      title={deal.status === "Inactive" ? `Inactive due to: ${deal.reason || "Not provided"}` : ""}
                      onClick={() => setSelectedDeal(deal)}
                    >
                      <div className="card-top-row">
                        <h4>{deal.name}</h4>
                        <span className="status-badge-zoho">{deal.stage.replaceAll("_", " ")}</span>
                      </div>
                      <div className="deal-status-row">
                        <span className={`deal-status-pill ${deal.status === "Inactive" ? "inactive" : "active"}`}>
                          {deal.status === "Inactive" ? "Inactive" : "Active"}
                        </span>
                      </div>
                      {deal.status === "Inactive" && (
                        <div className="deal-reason-text">Reason: {deal.reason || "Not provided"}</div>
                      )}
                      <div className="card-company-zoho">{deal.company || "-"}</div>
                      <div className="card-detail">{deal.contact || "-"}</div>
                      <div className="card-detail">{deal.email || "-"}</div>
                      <div className="card-detail">{deal.phone || "-"}</div>
                      <div className="card-source">
                        <span className="source-text">${Number(deal.amount || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>

        {showLostReasonModal && (
          <div
            className="modal-overlay-zoho"
            onClick={() => {
              setShowLostReasonModal(false);
              setPendingStageChange(null);
            }}
          >
            <div className="modal-box-zoho" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Reason for Closed Lost</h2>
                <button
                  className="modal-close"
                  onClick={() => {
                    setShowLostReasonModal(false);
                    setPendingStageChange(null);
                  }}
                >
                  x
                </button>
              </div>
              <div className="modal-form-zoho">
                <div className="form-group">
                  <label>Reason *</label>
                  <textarea
                    value={lostReason}
                    onChange={(event) => setLostReason(event.target.value)}
                    rows={4}
                    placeholder="Add why this deal was lost (e.g., Budget Issue)"
                  />
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => {
                      setShowLostReasonModal(false);
                      setPendingStageChange(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button type="button" className="btn-submit" onClick={submitLostReason}>
                    Save & Move
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showExportModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowExportModal(false)}>
            <div className="modal-box-zoho export-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Export Deal</h2>
                <button className="modal-close" onClick={() => setShowExportModal(false)}>x</button>
              </div>
              <div className="modal-form-zoho export-modal-form">
                <div className="export-form-row">
                  <label htmlFor="deal-export-view">Custom view</label>
                  <select id="deal-export-view" value={exportView} onChange={(e) => setExportView(e.target.value)}>
                    {exportViews.map((view) => (
                      <option key={view.id} value={view.id}>{view.name}</option>
                    ))}
                  </select>
                </div>
                <div className="export-form-row">
                  <label htmlFor="deal-export-fields">Fields</label>
                  <select id="deal-export-fields" value={exportFieldScope} onChange={(e) => setExportFieldScope(e.target.value)}>
                    <option value="custom">Fields from custom view</option>
                    <option value="basic">Basic fields</option>
                    <option value="all">All fields</option>
                  </select>
                </div>
                <div className="export-form-row export-type-row">
                  <label>Choose File Type</label>
                  <div className="export-type-options">
                    <label className="export-radio-option">
                      <input type="radio" name="deal-export-type" value="csv" checked={exportType === "csv"} onChange={(e) => setExportType(e.target.value)} />
                      <span>CSV</span>
                    </label>
                    <label className="export-radio-option">
                      <input type="radio" name="deal-export-type" value="xlsx" checked={exportType === "xlsx"} onChange={(e) => setExportType(e.target.value)} />
                      <span>XLSX</span>
                    </label>
                    <label className="export-radio-option">
                      <input type="radio" name="deal-export-type" value="pdf" checked={exportType === "pdf"} onChange={(e) => setExportType(e.target.value)} />
                      <span>PDF</span>
                    </label>
                  </div>
                </div>
                <div className="export-form-row">
                  <label htmlFor="deal-export-charset">Charset</label>
                  <select id="deal-export-charset" value={exportCharset} onChange={(e) => setExportCharset(e.target.value)} disabled={exportType !== "csv"}>
                    <option value="utf-8">UTF-8 (Unicode)</option>
                    <option value="us-ascii">US-ASCII</option>
                  </select>
                </div>
                <div className="export-note-box">
                  {`You can export ${getExportDeals().length.toLocaleString()} deal record(s) from this view.`}
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowExportModal(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-submit" onClick={handleExportDeals}>
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showFilterModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowFilterModal(false)}>
            <div className="modal-box-zoho filter-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Filters</h2>
                <button className="modal-close" onClick={() => setShowFilterModal(false)}>x</button>
              </div>
              <div className="modal-form-zoho">
                <DealFilterBuilder
                  filters={filters}
                  onChange={setFilters}
                  onApply={(nextFilters) => {
                    setFilters(nextFilters);
                    fetchDeals(nextFilters);
                    setShowFilterModal(false);
                  }}
                  onClear={() => {
                    setFilters({});
                    fetchDeals({});
                    setShowFilterModal(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {showModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Create New Deal</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>x</button>
              </div>
              <form onSubmit={submitNewDeal} className="modal-form-zoho">
                <div className="form-section">
                  <h3>Basic Information</h3>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Salutation *</label>
                    <select
                      value={newDeal.salutation}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, salutation: e.target.value }))}
                      required
                    >
                      {salutations.map((salutation) => (
                        <option key={salutation || "blank"} value={salutation}>
                          {salutation || "Salutation"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>First Name *</label>
                    <input
                      type="text"
                      value={newDeal.firstName}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, firstName: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name *</label>
                    <input
                      type="text"
                      value={newDeal.lastName}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, lastName: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Title *</label>
                    <input
                      type="text"
                      value={newDeal.title}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email *</label>
                    <input
                      type="email"
                      value={newDeal.email}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Company *</label>
                    <input
                      type="text"
                      name="company"
                      value={newDeal.company}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, company: e.target.value }))}
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Contact *</label>
                    <input
                      type="text"
                      name="contact"
                      value={newDeal.contact}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, contact: e.target.value }))}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Secondary Email</label>
                    <input
                      type="email"
                      name="email"
                      value={newDeal.secondaryEmail}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, secondaryEmail: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Amount (Deal Value) *</label>
                    <input
                      type="number"
                      name="amount"
                      min="0"
                      value={newDeal.amount}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, amount: e.target.value }))}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Alternative Contact</label>
                    <input
                      type="tel"
                      name="phone"
                      value={newDeal.phone}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, phone: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group">
                    <label>Closing Date *</label>
                    <input
                      type="date"
                      name="closingDate"
                      min={minDate}
                      value={newDeal.closingDate}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, closingDate: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="form-section">
                  <h3>Additional Details</h3>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Website</label>
                    <input
                      type="url"
                      value={newDeal.website}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, website: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Industry</label>
                    <select
                      value={newDeal.industry}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, industry: e.target.value }))}
                    >
                      {industries.map((industry) => (
                        <option key={industry || "blank"} value={industry}>
                          {industry || "Select industry"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Deal Stage *</label>
                    <select
                      value={newDeal.stage}
                      onChange={(e) =>
                        setNewDeal((prev) => ({
                          ...prev,
                          stage: e.target.value,
                          probability: DEFAULT_PROBABILITY_BY_STAGE[e.target.value] ?? prev.probability,
                        }))
                      }
                      required
                    >
                      <option value="" disabled>Select deal stage</option>
                      {stages.filter((stage) => stage.id !== "lost").map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Deal Type *</label>
                    <select
                      value={newDeal.dealType}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, dealType: e.target.value }))}
                      required
                    >
                      {dealTypeOptions.map((typeOption) => (
                        <option key={typeOption || "blank"} value={typeOption}>
                          {typeOption || "Select deal type"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Probability (%)</label>
                    <input
                      type="number"
                      name="probability"
                      min="0"
                      max="100"
                      value={newDeal.probability}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, probability: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group">
                    <label>Expected Revenue</label>
                    <input
                      type="number"
                      name="expectedRevenue"
                      step="0.01"
                      min="0"
                      value={newDeal.probability === "" ? newDeal.expectedRevenue : computedExpectedRevenue}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, expectedRevenue: e.target.value }))}
                      autoComplete="off"
                      disabled={newDeal.probability !== ""}
                    />
                  </div>
                </div>
                <div className="form-section">
                  <h3>Product Details</h3>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Product *</label>
                    <select
                      name="product"
                      value={newDeal.product}
                      onChange={(e) =>
                        setNewDeal((prev) => ({
                          ...prev,
                          product: e.target.value,
                          quantity: "",
                          billingCycle: "",
                        }))
                      }
                      required
                    >
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product._id} value={product._id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {selectedNewDealItemType === "product" && (
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        min="0"
                        value={newDeal.quantity}
                        onChange={(e) => setNewDeal((prev) => ({ ...prev, quantity: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                )}
                {selectedNewDealItemType === "service" && (
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Plan / Billing Cycle *</label>
                      <select
                        value={newDeal.billingCycle}
                        onChange={(e) => setNewDeal((prev) => ({ ...prev, billingCycle: e.target.value }))}
                        required
                      >
                        <option value="">Select plan</option>
                        {billingCycleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                <div className="form-section">
                  <h3>Address</h3>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Street</label>
                    <input
                      type="text"
                      value={newDeal.street}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, street: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>City</label>
                    <input
                      type="text"
                      value={newDeal.city}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>State</label>
                    <input
                      type="text"
                      value={newDeal.state}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, state: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Postal Code</label>
                    <input
                      type="text"
                      value={newDeal.postalCode}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, postalCode: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Country</label>
                    <input
                      type="text"
                      value={newDeal.country}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, country: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Deal Source *</label>
                    <select
                      name="leadSource"
                      value={newDeal.leadSource}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, leadSource: e.target.value }))}
                      required
                    >
                      {dealSources.map((source) => (
                        <option key={source || "blank"} value={source}>
                          {source || "Select source"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Campaign Source</label>
                    <input
                      type="text"
                      name="campaignSource"
                      value={newDeal.campaignSource}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, campaignSource: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Next Step</label>
                    <input
                      type="text"
                      name="nextStep"
                      value={newDeal.nextStep}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, nextStep: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      name="description"
                      rows={3}
                      value={newDeal.description}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit">Create Deal</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showImportModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowImportModal(false)}>
            <div className="modal-box-zoho import-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Import Deals from CSV</h2>
                <button className="modal-close" onClick={() => setShowImportModal(false)}>x</button>
              </div>
              <div className="modal-form-zoho">
                <div className="form-section">
                  <h3>Upload CSV File</h3>
                  <p className="import-helper-text">
                    Supported headers: name, dealName, company, amount, contact, email, phone, stage, closingDate, probability, expectedRevenue, nextStep, dealType, leadSource, campaignSource, description.
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    className="csv-file-input"
                    onChange={handleCsvFileChange}
                  />
                  {importFileName && (
                    <div className="import-file-summary">
                      <span>{importFileName}</span>
                      <span>{importRows.length} deal(s) ready</span>
                    </div>
                  )}
                </div>
                {importRows.length > 0 && (
                  <div className="form-section">
                    <h3>Preview</h3>
                    <div className="import-preview-table-wrapper">
                      <table className="import-preview-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Company</th>
                            <th>Amount</th>
                            <th>Stage</th>
                            <th>Closing Date</th>
                            <th>Probability</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.slice(0, 5).map((deal, index) => (
                            <tr key={`${deal.name}-${index}`}>
                              <td>{deal.name}</td>
                              <td>{deal.company || "-"}</td>
                              <td>${Number(deal.amount || 0).toLocaleString()}</td>
                              <td>{deal.stage}</td>
                              <td>{deal.closingDate || "-"}</td>
                              <td>{deal.probability || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importRows.length > 5 && (
                      <p className="import-helper-text">Showing first 5 rows of {importRows.length} deals.</p>
                    )}
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowImportModal(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-submit" onClick={handleImportDeals}>
                    Import Deals
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedDeal && (
          <div className="modal-overlay-zoho" onClick={() => setSelectedDeal(null)}>
            <div className="modal-box-zoho modal-view" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>{selectedDeal.name}</h2>
                <button className="modal-close" onClick={() => setSelectedDeal(null)}>x</button>
              </div>
              <div className="lead-details-view">
                <div className="deal-detail-actions">
                  {!isEditingSelectedDeal ? (
                    <button type="button" className="lead-toolbar-pill-button" onClick={() => setIsEditingSelectedDeal(true)}>
                      Edit
                    </button>
                  ) : (
                    <>
                      <button type="button" className="lead-toolbar-pill-button" onClick={saveEditedDeal}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="lead-toolbar-pill-button"
                        onClick={() => {
                          setIsEditingSelectedDeal(false);
                          setEditDealForm({
                            name: selectedDeal.name || "",
                            company: selectedDeal.company || "",
                            contact: selectedDeal.contact || "",
                            email: selectedDeal.email || "",
                            phone: selectedDeal.phone || "",
                            amount: selectedDeal.amount ?? "",
                            closingDate: selectedDeal.closingDate || "",
                            probability: selectedDeal.probability ?? "",
                            expectedRevenue: selectedDeal.expectedRevenue ?? "",
                            nextStep: selectedDeal.nextStep || "",
                            dealType: selectedDeal.dealType || "",
                            leadSource: selectedDeal.leadSource || "",
                            campaignSource: selectedDeal.campaignSource || "",
                            description: selectedDeal.description || "",
                            product: selectedDeal.product?._id || selectedDeal.product || "",
                            quantity: selectedDeal.quantity ?? "",
                            billingCycle: selectedDeal.billingCycle || "",
                          });
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Company</span>
                  {isEditingSelectedDeal ? (
                    <input
                      className="deal-detail-input"
                      value={editDealForm?.company || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, company: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.company || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Contact</span>
                  {isEditingSelectedDeal ? (
                    <input
                      className="deal-detail-input"
                      value={editDealForm?.contact || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, contact: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.contact || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email</span>
                  {isEditingSelectedDeal ? (
                    <input
                      type="email"
                      className="deal-detail-input"
                      value={editDealForm?.email || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, email: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.email || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Alternative Contact</span>
                  {isEditingSelectedDeal ? (
                    <input
                      className="deal-detail-input"
                      value={editDealForm?.phone || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, phone: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.phone || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Deal Value</span>
                  {isEditingSelectedDeal ? (
                    <input
                      type="number"
                      className="deal-detail-input"
                      value={editDealForm?.amount ?? ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, amount: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">${Number(selectedDeal.amount || 0).toLocaleString()}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Product</span>
                  {isEditingSelectedDeal ? (
                    <select
                      className="deal-detail-input"
                      value={editDealForm?.product || ""}
                      onChange={(e) =>
                        setEditDealForm((prev) => ({
                          ...prev,
                          product: e.target.value,
                          quantity: "",
                          billingCycle: "",
                        }))
                      }
                    >
                      <option value="">Select product</option>
                      {products.map((product) => (
                        <option key={product._id} value={product._id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="detail-value">{getProductLabel(selectedDeal.product)}</span>
                  )}
                </div>
                {isEditingSelectedDeal && selectedEditDealItemType === "product" && (
                  <div className="detail-row">
                    <span className="detail-label">Quantity</span>
                    <input
                      type="number"
                      className="deal-detail-input"
                      min="0"
                      value={editDealForm?.quantity ?? ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, quantity: e.target.value }))}
                    />
                  </div>
                )}
                {isEditingSelectedDeal && selectedEditDealItemType === "service" && (
                  <div className="detail-row">
                    <span className="detail-label">Plan / Billing Cycle</span>
                    <select
                      className="deal-detail-input"
                      value={editDealForm?.billingCycle || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, billingCycle: e.target.value }))}
                    >
                      <option value="">Select plan</option>
                      {billingCycleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-label">Deal Stage</span>
                  {isEditingSelectedDeal ? (
                    <select
                      className="deal-detail-input"
                      value={editDealForm?.stage || ""}
                      onChange={(e) =>
                        setEditDealForm((prev) => ({
                          ...prev,
                          stage: e.target.value,
                        }))
                      }
                    >
                      {stages.filter((stage) => stage.id !== "lost").map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="detail-value">{selectedDeal.stage ? selectedDeal.stage.replaceAll("_", " ") : "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Deal Type</span>
                  {isEditingSelectedDeal ? (
                    <select
                      className="deal-detail-input"
                      value={editDealForm?.dealType || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, dealType: e.target.value }))}
                    >
                      {dealTypeOptions.map((typeOption) => (
                        <option key={typeOption || "blank"} value={typeOption}>
                          {typeOption || "Select deal type"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="detail-value">{selectedDeal.dealType || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Closing Date</span>
                  {isEditingSelectedDeal ? (
                    <input
                      type="date"
                      className="deal-detail-input"
                      min={minDate}
                      value={editDealForm?.closingDate || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, closingDate: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.closingDate || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Probability</span>
                  {isEditingSelectedDeal ? (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      className="deal-detail-input"
                      value={editDealForm?.probability ?? ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, probability: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.probability === null ? "-" : `${selectedDeal.probability}%`}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Expected Revenue</span>
                  {isEditingSelectedDeal ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="deal-detail-input"
                      value={editDealForm?.expectedRevenue ?? ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, expectedRevenue: e.target.value }))}
                      disabled={editDealForm?.probability !== "" && editDealForm?.probability !== null}
                    />
                  ) : (
                    <span className="detail-value">
                      {selectedDeal.expectedRevenue === null || selectedDeal.expectedRevenue === undefined
                        ? "-"
                      : `$${Number(selectedDeal.expectedRevenue).toLocaleString()}`}
                    </span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Lead Source</span>
                  {isEditingSelectedDeal ? (
                    <input
                      className="deal-detail-input"
                      value={editDealForm?.leadSource || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, leadSource: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.leadSource || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Campaign Source</span>
                  {isEditingSelectedDeal ? (
                    <input
                      className="deal-detail-input"
                      value={editDealForm?.campaignSource || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, campaignSource: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.campaignSource || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Next Step</span>
                  {isEditingSelectedDeal ? (
                    <input
                      className="deal-detail-input"
                      value={editDealForm?.nextStep || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, nextStep: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.nextStep || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Description</span>
                  {isEditingSelectedDeal ? (
                    <textarea
                      rows={3}
                      className="deal-detail-input deal-detail-textarea"
                      value={editDealForm?.description || ""}
                      onChange={(e) => setEditDealForm((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  ) : (
                    <span className="detail-value">{selectedDeal.description || "-"}</span>
                  )}
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className="detail-value">{selectedDeal.status || "Active"}</span>
                </div>
                {selectedDeal.status === "Inactive" && (
                  <div className="detail-row">
                    <span className="detail-label">Reason</span>
                    <span className="detail-value">{selectedDeal.reason || "-"}</span>
                  </div>
                )}
              </div>
              <div className="status-section">
                <h3>Change Stage</h3>
                <div className="status-grid">
                  {(() => {
                    const currentStage = selectedDeal.stage;
                    const allowedStages = new Set([
                      currentStage,
                      "lost",
                      ...(allowedTransitions[currentStage] || [])
                    ]);
                    return stages.map((stage) => (
                      <button
                        key={stage.id}
                        className={`status-btn-zoho ${selectedDeal.stage === stage.id ? "active" : ""} ${!allowedStages.has(stage.id) ? "disabled" : ""}`}
                        style={{ 
                          borderColor: stage.color, 
                          color: selectedDeal.stage === stage.id ? stage.color : "",
                          opacity: allowedStages.has(stage.id) ? 1 : 0.5
                        }}
                        disabled={!allowedStages.has(stage.id)}
                        title={!allowedStages.has(stage.id) ? `Invalid transition from ${currentStage.replace(/_/g, " ")}` : ""}
                        onClick={() => requestStageChange(selectedDeal._id, stage.id)}
                      >
                        {stage.name}
                      </button>
                    ));
                  })()}
                </div>
              </div>
              {selectedDeal.timeline && selectedDeal.timeline.length > 0 && (
                <div className="timeline-section">
                  <h3>Activity Timeline</h3>
                  <div className="timeline-list">
                    {selectedDeal.timeline.slice().reverse().map((event, index) => (
                      <div key={index} className="timeline-item">
                        <div className="timeline-user">{event.userName || 'User'}</div>
                        <div className="timeline-action">
                          Stage changed from <span className="stage-old">{event.fromStage.replaceAll('_', ' ')}</span> 
                          to <span className="stage-new">{event.toStage.replaceAll('_', ' ')}</span>
                        </div>
                        <div className="timeline-time">
                          {new Date(event.changedAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <RecordActivityPanel
                recordType="Deal"
                recordId={selectedDeal._id}
                recordName={selectedDeal.name}
              />
              <button className="delete-btn-zoho" onClick={() => deleteDeal(selectedDeal._id)}>
                Delete Deal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Deals;
