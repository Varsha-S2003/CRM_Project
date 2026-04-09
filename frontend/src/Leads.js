import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Leads.css";
import Sidebar from "./Sidebar";
import FilterBuilder from "./components/FilterBuilder";
import { DEFAULT_COLUMNS } from "./utils/viewsUtils";

const calculateLeadScoreForDisplay = (lead = {}) => {
  let score = 0;

  const emailOpened = Number(lead.emailOpened) || 0;
  const websiteVisits = Number(lead.websiteVisits) || 0;
  const formSubmissions = Number(lead.formSubmissions) || 0;
  const hasEmail = Boolean(String(lead.email || "").trim());
  const hasPhone = Boolean(String(lead.phone || lead.mobile || "").trim());
  const hasCompany = Boolean(String(lead.company || "").trim());
  const hasSource = Boolean(String(lead.source || "").trim());
  const hasAssignee = Boolean(lead.assignedTo);
  const normalizedStatus = String(lead.status || "").trim().toLowerCase();

  if (hasEmail) score += 8;
  if (hasPhone) score += 10;
  if (hasCompany) score += 10;
  if (hasSource) score += 5;
  if (hasAssignee) score += 5;

  if (emailOpened > 0) score += Math.min(12, emailOpened * 4);
  if (websiteVisits > 0) score += Math.min(20, websiteVisits * 2);
  if (formSubmissions > 0) score += Math.min(15, formSubmissions * 10);

  if (normalizedStatus === "new") score += 5;
  if (normalizedStatus === "contacted") score += 15;
  if (normalizedStatus === "qualified") score += 30;
  if (normalizedStatus === "proposal" || normalizedStatus === "proposal_sent") score += 40;
  if (normalizedStatus === "converted") score += 50;
  if (normalizedStatus === "lost") score -= 10;

  if (lead.lastActivityDate) {
    const lastActivity = new Date(lead.lastActivityDate);
    if (!Number.isNaN(lastActivity.getTime())) {
      const daysInactive = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
      if (daysInactive <= 7) {
        score += 10;
      } else if (daysInactive <= 30) {
        score += 5;
      } else {
        score -= 10;
      }
    }
  }

  return Math.max(0, Math.min(100, score));
};

const getLeadRatingForDisplay = (score = 0) => {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
};

const normalizeLeadScoringForDisplay = (lead) => {
  if (!lead || typeof lead !== "object") return lead;
  const score = calculateLeadScoreForDisplay(lead);
  return {
    ...lead,
    score,
    rating: getLeadRatingForDisplay(score),
  };
};

const normalizeLeadListForDisplay = (items) =>
  (Array.isArray(items) ? items : []).map((lead) => normalizeLeadScoringForDisplay(lead));

function Leads() {
  const ALL_LEADS_VIEW_ID = "__all_leads__";
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [duplicateDialog, setDuplicateDialog] = useState({
    isOpen: false,
    message: "",
    sourceLeadId: "",
    duplicateLead: null,
    canOpenMerge: false,
    draftLeadData: null,
  });
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState([]);  
  const [mergeLeadIds, setMergeLeadIds] = useState([]);
  const [mergePrimaryLeadId, setMergePrimaryLeadId] = useState("");
  const [deleteMergedLeads, setDeleteMergedLeads] = useState(true);

  // 👇 SAVED VIEWS STATE 👇
  const [views, setViews] = useState([]);
  const [currentViewId, setCurrentViewId] = useState(null);
  const [filters, setFilters] = useState({});
  const [showViewDropdown, setShowViewDropdown] = useState(false);

  const [sortConfig, setSortConfig] = useState({ createdAt: -1 });
  const [showFilterModal, setShowFilterModal] = useState(false);

  // 👆 SAVED VIEWS STATE 👆

  const [selectedLead, setSelectedLead] = useState(null);
  const [isEditingLead, setIsEditingLead] = useState(false);
  const [editLeadForm, setEditLeadForm] = useState(null);
  const [editLeadErrors, setEditLeadErrors] = useState({});
  const [exportView, setExportView] = useState("all");
  const [exportFieldScope, setExportFieldScope] = useState("custom");
  const [exportType, setExportType] = useState("csv");
  const [exportCharset, setExportCharset] = useState("utf-8");
  const createMenuRef = useRef(null);
  const viewDropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const [newLead, setNewLead] = useState({
    salutation: "",
    firstName: "",
    lastName: "",
    title: "",
    email: "",
    secondaryEmail: "",
    phone: "",
    mobile: "",
    company: "",
    website: "",
    itemType: "",
    itemId: "",
    industry: "",
    gstin: "",
    annualRevenue: "",
    employeeCount: "",
    source: "",
    status: "new",
    notes: "",
    street: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  });
  const [newLeadErrors, setNewLeadErrors] = useState({});
  const [cardAssignSelection, setCardAssignSelection] = useState({});
  const [showQualifiedNotesModal, setShowQualifiedNotesModal] = useState(false);
  const [qualifiedNotes, setQualifiedNotes] = useState("");
  const [isSavingQualifiedNotes, setIsSavingQualifiedNotes] = useState(false);
  const [pendingQualifiedStatus, setPendingQualifiedStatus] = useState(null);
  // compute role flags for UI
  const role = localStorage.getItem("role")?.toUpperCase();
  const currentUserId = localStorage.getItem("userId") || "";
  const currentUserName =
    localStorage.getItem("name") ||
    localStorage.getItem("username") ||
    "Current User";
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";

  const [employees, setEmployees] = useState([]);
  const [leadItems, setLeadItems] = useState([]);
  const [loadingLeadItems, setLoadingLeadItems] = useState(false);

  const getEntityId = (value) => {
    if (!value) return "";
    if (typeof value === "object") return String(value._id || value.id || value.userId || "");
    return String(value);
  };

  const getUserDisplayLabel = (user) => {
    if (!user) return "";
    const primary = user.name || user.username || user.email || user.employee_id || "User";
    const roleLabel = String(user.role || "").toUpperCase();
    return roleLabel ? `${primary} (${roleLabel})` : primary;
  };

  const getAssignedUserLabel = (assignedTo) => {
    const assignedId = getEntityId(assignedTo);
    if (!assignedId) return "";

    if (assignedTo && typeof assignedTo === "object") {
      return getUserDisplayLabel(assignedTo);
    }

    const fromDirectory = employees.find((employee) => String(employee._id) === String(assignedId));
    if (fromDirectory) {
      return getUserDisplayLabel(fromDirectory);
    }

    if (currentUserId && String(currentUserId) === String(assignedId)) {
      const roleLabel = String(role || "").toUpperCase();
      return roleLabel ? `${currentUserName} (${roleLabel})` : currentUserName;
    }

    return "";
  };

  const getLeadItemName = (lead) => {
    const item = lead?.itemId;
    if (item && typeof item === "object") {
      return item.name || item.title || "-";
    }

    const itemId = getEntityId(item);
    if (!itemId) return "-";

    const fromList = leadItems.find((entry) => String(entry?._id) === String(itemId));
    return fromList?.name || "-";
  };

  // 🆕 VIEWS FUNCTIONS 🆕
  const fetchViews = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/leads/views", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setViews(res.data);

      setCurrentViewId((prev) => {
        if (prev && (prev === ALL_LEADS_VIEW_ID || res.data.some((view) => view._id === prev))) {
          return prev;
        }
        return ALL_LEADS_VIEW_ID;
      });
    } catch (err) {
      console.error("Failed to fetch views:", err);
    }
  }, [ALL_LEADS_VIEW_ID]);

  const fetchFilteredLeads = useCallback(async (nextFilters = filters, nextSort = sortConfig) => {
    try {
      const token = localStorage.getItem("token");
      const viewMode = role === "EMPLOYEE" ? "my" : "all";
      
      const payload = {
        filters: nextFilters,
        sort: nextSort,
        viewMode,
        limit: 100,
        skip: 0
      };

      const res = await axios.post("http://localhost:5000/api/leads/filter", payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLeads(normalizeLeadListForDisplay(res.data));
    } catch (err) {
      console.error("Failed to fetch filtered leads:", err);
    }
  }, [filters, sortConfig, role]);

  // Load view and refresh leads
  const loadView = useCallback((viewId) => {
    if (viewId === ALL_LEADS_VIEW_ID) {
      const nextFilters = {};
      const nextSort = { createdAt: -1 };
      setCurrentViewId(ALL_LEADS_VIEW_ID);
      setFilters(nextFilters);
      setSortConfig(nextSort);
      fetchFilteredLeads(nextFilters, nextSort);
      return;
    }

    const view = views.find(v => v._id === viewId);
    if (view) {
      setCurrentViewId(viewId);
      const nextFilters = view.filters || {};
      const nextSort = view.sort || { createdAt: -1 };
      setFilters(nextFilters);
      setSortConfig(nextSort);
      fetchFilteredLeads(nextFilters, nextSort);
    }
  }, [views, fetchFilteredLeads, ALL_LEADS_VIEW_ID]);

  // Update current filters/columns/sort
  const updateFilters = (newFilters) => {
    setFilters(newFilters);
    fetchFilteredLeads(newFilters, sortConfig);
  };



  useEffect(() => {
    if (role) {
      fetchViews();
    }
  }, [role, fetchViews]);

  const fetchEmployees = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/employees/assignable", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployees(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      try {
        if (!isAdmin) {
          setEmployees([]);
          return;
        }
        const token = localStorage.getItem("token");
        const fallbackRes = await axios.get("http://localhost:5000/api/employees", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const managers = Array.isArray(fallbackRes.data)
          ? fallbackRes.data
              .filter((user) => String(user?.role || "").toUpperCase() === "MANAGER")
              .map((user) => ({
                ...user,
                role: String(user.role || "").toUpperCase(),
              }))
          : [];
        setEmployees(managers);
      } catch (fallbackError) {
        console.error("Fallback assignable users fetch failed:", fallbackError);
        setEmployees([]);
      }
    }
  }, [isAdmin]);

  const fetchLeadItems = useCallback(async () => {
    try {
      setLoadingLeadItems(true);
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/items", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLeadItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to fetch lead items", err);
      setLeadItems([]);
    } finally {
      setLoadingLeadItems(false);
    }
  }, []);

  const navigate = useNavigate();

  const stages = [
    { id: "new", name: "New", color: "#2563eb" },
    { id: "contacted", name: "Contacted", color: "#0ea5e9" },
    { id: "qualified", name: "Qualified", color: "#6366f1" },
    { id: "converted", name: "Converted", color: "#10b981" },
    { id: "lost", name: "Lost", color: "#ef4444" },
  ];

  // Lead stage movement validation (matches backend)
  const allowedTransitions = {
    new: ["contacted"],
    contacted: ["qualified", "new", "lost"],
    qualified: ["proposal_sent", "contacted", "lost"],
    proposal: ["proposal_sent", "qualified", "lost"],
    proposal_sent: ["qualified"],
    converted: [],
    lost: []
  };

  const salutations = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];
  const sources = ["Website", "Referral", "Social Media", "Email Campaign", "Cold Call", "Trade Show", "Other"];
  const industries = ["Technology", "Manufacturing", "Finance", "Healthcare", "Retail", "Education", "Real Estate", "Other"];
  const stateOptionsByCountry = {
    India: [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
    "Andaman and Nicobar Islands",
    "Chandigarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Jammu and Kashmir",
    "Ladakh",
    "Lakshadweep",
    "Puducherry",
    ],
    Canada: [
      "Alberta",
      "British Columbia",
      "Manitoba",
      "New Brunswick",
      "Newfoundland and Labrador",
      "Nova Scotia",
      "Ontario",
      "Prince Edward Island",
      "Quebec",
      "Saskatchewan",
      "Northwest Territories",
      "Nunavut",
      "Yukon",
    ],
    "United States": [
      "Alabama",
      "Alaska",
      "Arizona",
      "Arkansas",
      "California",
      "Colorado",
      "Connecticut",
      "Delaware",
      "Florida",
      "Georgia",
      "Hawaii",
      "Idaho",
      "Illinois",
      "Indiana",
      "Iowa",
      "Kansas",
      "Kentucky",
      "Louisiana",
      "Maine",
      "Maryland",
      "Massachusetts",
      "Michigan",
      "Minnesota",
      "Mississippi",
      "Missouri",
      "Montana",
      "Nebraska",
      "Nevada",
      "New Hampshire",
      "New Jersey",
      "New Mexico",
      "New York",
      "North Carolina",
      "North Dakota",
      "Ohio",
      "Oklahoma",
      "Oregon",
      "Pennsylvania",
      "Rhode Island",
      "South Carolina",
      "South Dakota",
      "Tennessee",
      "Texas",
      "Utah",
      "Vermont",
      "Virginia",
      "Washington",
      "West Virginia",
      "Wisconsin",
      "Wyoming",
      "District of Columbia",
    ],
    "United Kingdom": [
      "England",
      "Scotland",
      "Wales",
      "Northern Ireland",
    ],
    Australia: [
      "New South Wales",
      "Victoria",
      "Queensland",
      "Western Australia",
      "South Australia",
      "Tasmania",
      "Australian Capital Territory",
      "Northern Territory",
    ],
    Singapore: [
      "Central Region",
      "East Region",
      "North Region",
      "North-East Region",
      "West Region",
    ],
    "United Arab Emirates": [
      "Abu Dhabi",
      "Dubai",
      "Sharjah",
      "Ajman",
      "Umm Al Quwain",
      "Ras Al Khaimah",
      "Fujairah",
    ],
    Other: [
      "State/Province 1",
      "State/Province 2",
      "State/Province 3",
    ],
  };
  const countryOptions = ["India", "United States", "United Kingdom", "Canada", "Australia", "Singapore", "United Arab Emirates", "Other"];
  const getStateOptionsForCountry = (country) => stateOptionsByCountry[String(country || "").trim()] || [];

  const handleNewLeadCountryChange = (country) => {
    setNewLead((prev) => {
      const nextStateOptions = getStateOptionsForCountry(country);
      const nextState = nextStateOptions.includes(prev.state) ? prev.state : "";
      return { ...prev, country, state: nextState };
    });
    setNewLeadErrors((prev) => {
      if (!prev.country && !prev.state) return prev;
      const next = { ...prev };
      delete next.country;
      delete next.state;
      return next;
    });
  };

  const handleEditLeadCountryChange = (country) => {
    setEditLeadForm((prev) => {
      if (!prev) return prev;
      const nextStateOptions = getStateOptionsForCountry(country);
      const nextState = nextStateOptions.includes(prev.state) ? prev.state : "";
      return { ...prev, country, state: nextState };
    });
    setEditLeadErrors((prev) => {
      if (!prev.country && !prev.state) return prev;
      const next = { ...prev };
      delete next.country;
      delete next.state;
      return next;
    });
  };
  const exportViews = [{ id: "all", name: "All Leads" }, ...stages.map((stage) => ({ id: stage.id, name: `${stage.name} Leads` }))];
  const exportFieldPresets = {
    custom: ["name", "email", "phone", "company", "source", "status"],
    basic: ["name", "title", "email", "company", "score", "rating", "status"],
    all: ["name", "title", "email", "secondaryEmail", "phone", "mobile", "company", "website", "industry", "annualRevenue", "employeeCount", "source", "score", "rating", "status", "city", "state", "country", "assignedTo", "createdAt"],
  };
  const exportFields = [
    { key: "name", label: "Lead Name", getValue: (lead) => lead.name || "-" },
    { key: "title", label: "Title", getValue: (lead) => lead.title || "-" },
    { key: "email", label: "Email", getValue: (lead) => lead.email || "-" },
    { key: "secondaryEmail", label: "Secondary Email", getValue: (lead) => lead.secondaryEmail || "-" },
    { key: "phone", label: "Phone", getValue: (lead) => lead.phone || "-" },
    { key: "mobile", label: "Mobile", getValue: (lead) => lead.mobile || "-" },
    { key: "company", label: "Company", getValue: (lead) => lead.company || "-" },
    { key: "website", label: "Website", getValue: (lead) => lead.website || "-" },
    { key: "industry", label: "Industry", getValue: (lead) => lead.industry || "-" },
    { key: "annualRevenue", label: "Annual Revenue", getValue: (lead) => lead.annualRevenue || "-" },
    { key: "employeeCount", label: "Employee Count", getValue: (lead) => lead.employeeCount || "-" },
    { key: "source", label: "Source", getValue: (lead) => lead.source || "-" },
    { key: "score", label: "Score", getValue: (lead) => Number(lead.score) || 0 },
    { key: "rating", label: "Rating", getValue: (lead) => lead.rating || "-" },
    { key: "status", label: "Status", getValue: (lead) => lead.status || "-" },
    { key: "city", label: "City", getValue: (lead) => lead.address?.city || "-" },
    { key: "state", label: "State", getValue: (lead) => lead.address?.state || "-" },
    { key: "country", label: "Country", getValue: (lead) => lead.address?.country || "-" },
    {
      key: "assignedTo",
      label: "Assigned To",
      getValue: (lead) => {
        return getAssignedUserLabel(lead.assignedTo) || "Unassigned";
      },
    },
    { key: "createdAt", label: "Added On", getValue: (lead) => formatAddedDate(lead.createdAt) },
  ];

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchLeads = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const role = localStorage.getItem("role")?.toUpperCase();
      const params = {};
      if (search) params.search = search;
      // pick endpoint according to role
      let url;
      if (role === "EMPLOYEE") {
        url = "/api/leads/my";
      } else {
        // ADMIN or MANAGER
        url = "/api/leads/all";
      }
      const res = await axios.get(`http://localhost:5000${url}`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setLeads(normalizeLeadListForDisplay(res.data));
    } catch (err) {
      console.error(err);
    }
  }, [search]);

  useEffect(() => {
    const role = localStorage.getItem("role")?.toUpperCase();
    if (!role) {
      navigate("/login");
    }
    if (isAdmin || isManager) {
      fetchEmployees();
    }
  }, [navigate, isAdmin, isManager, fetchEmployees]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    if (showModal || isEditingLead || selectedLead) {
      fetchLeadItems();
    }
  }, [showModal, isEditingLead, selectedLead, fetchLeadItems]);

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

  const handleAddLead = () => {
    setNewLead({
      salutation: "",
      firstName: "",
      lastName: "",
      title: "",
      email: "",
      secondaryEmail: "",
      phone: "",
      mobile: "",
      company: "",
      website: "",
      itemType: "",
      itemId: "",
      industry: "",
      gstin: "",
      annualRevenue: "",
      employeeCount: "",
      source: "",
      status: "new",
      notes: "",
      street: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
    });
    setNewLeadErrors({});
    setShowModal(true);
    setShowCreateMenu(false);
  };

  const setNewLeadField = (field, value) => {
    setNewLead((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "itemType") {
        next.itemId = "";
      }
      return next;
    });
    setNewLeadErrors((prev) => {
      const shouldClearContactError =
        ["email", "phone", "mobile"].includes(field) && Boolean(prev.contact);

      if (!prev[field] && !shouldClearContactError) return prev;

      const next = { ...prev };
      delete next[field];
      if (shouldClearContactError) {
        delete next.contact;
      }
      if (field === "itemType" && next.itemId) {
        delete next.itemId;
      }
      return next;
    });
  };

  const validateNewLeadForm = (lead) => {
    const errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const gstinRegex = /^[0-9]{2}[A-Z0-9]{13}$/;
    const phoneCharsRegex = /^[+]?[-()\s0-9]{7,20}$/;
    const isValidPhoneNumber = (value) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) return true;
      if (!phoneCharsRegex.test(trimmed)) return false;

      const digitCount = trimmed.replace(/\D/g, "").length;
      return digitCount >= 10 && digitCount <= 15;
    };

    if (!String(lead.firstName || "").trim()) {
      errors.firstName = "First name is required";
    }

    if (!String(lead.lastName || "").trim()) {
      errors.lastName = "Last name is required";
    }

    const email = String(lead.email || "").trim();
    const phone = String(lead.phone || "").trim();
    const mobile = String(lead.mobile || "").trim();

    if (!email && !phone) {
      errors.contact = "Provide at least one contact detail: Email or Phone";
    }

    if (email && !emailRegex.test(email)) {
      errors.email = "Enter a valid email address";
    }

    if (String(lead.secondaryEmail || "").trim() && !emailRegex.test(String(lead.secondaryEmail || "").trim())) {
      errors.secondaryEmail = "Enter a valid secondary email";
    }

    if (!isValidPhoneNumber(phone)) {
      errors.phone = "Enter a valid phone number";
    }

    if (!isValidPhoneNumber(mobile)) {
      errors.mobile = "Enter a valid mobile number";
    }

    if (!String(lead.company || "").trim()) {
      errors.company = "Company is required";
    }

    if (!String(lead.source || "").trim()) {
      errors.source = "Lead source is required";
    }

    if (!String(lead.itemType || "").trim()) {
      errors.itemType = "Type is required";
    }

    if (String(lead.website || "").trim()) {
      try {
        const url = new URL(String(lead.website || "").trim());
        if (!["http:", "https:"].includes(url.protocol)) {
          errors.website = "Website must start with http:// or https://";
        }
      } catch {
        errors.website = "Enter a valid website URL";
      }
    }

    if (String(lead.itemType || "").trim() && !["product", "service"].includes(String(lead.itemType).toLowerCase())) {
      errors.itemType = "Type must be Product or Service";
    }

    if (String(lead.itemType || "").trim() && !String(lead.itemId || "").trim()) {
      errors.itemId = `Please select a ${String(lead.itemType || "item").toLowerCase()}`;
    }

    if (String(lead.annualRevenue || "").trim() && Number(lead.annualRevenue) < 0) {
      errors.annualRevenue = "Annual revenue cannot be negative";
    }

    const gstin = String(lead.gstin || "").trim().toUpperCase();
    if (gstin && !gstinRegex.test(gstin)) {
      errors.gstin = "GSTIN must be a valid 15-character GSTIN";
    }

    if (String(lead.employeeCount || "").trim()) {
      const count = Number(lead.employeeCount);
      if (!Number.isInteger(count) || count < 0) {
        errors.employeeCount = "Employee count must be a non-negative whole number";
      }
    }

    return errors;
  };

  const handleOpenImportModal = () => {
    setImportFileName("");
    setImportRows([]);
    setShowImportModal(true);
    setShowCreateMenu(false);
  };

  const handleOpenExportModal = () => {
    setExportView("all");
    setExportFieldScope("custom");
    setExportType("csv");
    setExportCharset("utf-8");
    setShowExportModal(true);
  };

  const saveView = async ({ mode = "update" } = {}) => {
    try {
      const token = localStorage.getItem("token");
      const activeView = views.find((view) => view._id === currentViewId);
      const shouldCreate = mode === "create" || !activeView;

      let name = activeView?.name || "My View";
      if (shouldCreate) {
        const promptedName = window.prompt("Enter a view name", name);
        if (!promptedName) return;
        name = promptedName.trim();
        if (!name) return;
        if (name.toLowerCase() === "all leads") {
          window.alert('The name "All Leads" is reserved. Use a different view name.');
          return;
        }
      }

      const payload = {
        name,
        filters,
        sort: sortConfig,
        columns: DEFAULT_COLUMNS,
        visibility: activeView?.visibility || "private",
      };

      let res;
      if (shouldCreate) {
        res = await axios.post("http://localhost:5000/api/leads/views", payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        res = await axios.put(`http://localhost:5000/api/leads/views/${activeView._id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

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
      console.error("Failed to save view:", err);
      alert(err.response?.data?.message || "Failed to save view");
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
      await axios.delete(`http://localhost:5000/api/leads/views/${activeView._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setViews((prev) => prev.filter((view) => view._id !== activeView._id));
      loadView(ALL_LEADS_VIEW_ID);
      setShowViewDropdown(false);
      window.alert("View deleted.");
    } catch (err) {
      console.error("Failed to delete view:", err);
      alert(err.response?.data?.message || "Failed to delete view");
    }
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

  const visibleSavedViews = views.filter((view) => view.name !== "All Leads");
  const activeViewName =
    currentViewId === ALL_LEADS_VIEW_ID
      ? "All Leads"
      : visibleSavedViews.find((view) => view._id === currentViewId)?.name || "All Leads";

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

  const mapCsvRowToLead = (headers, rowValues) => {
    const row = headers.reduce((acc, header, index) => {
      acc[header] = rowValues[index] || "";
      return acc;
    }, {});

    const firstName = row.firstname || row.first || "";
    const lastName = row.lastname || row.last || "";
    const fullName = row.name || `${firstName} ${lastName}`.trim();
    const rawStatus = String(row.status || "new").trim().toLowerCase();
    const validStatuses = new Set(stages.map((stage) => stage.id));

    return {
      salutation: row.salutation || "",
      firstName,
      lastName,
      name: fullName,
      title: row.title || "",
      email: row.email || "",
      secondaryEmail: row.secondaryemail || "",
      phone: row.phone || row.mobile || "",
      mobile: row.mobile || "",
      company: row.company || row.organization || "",
      website: row.website || "",
      industry: row.industry || "",
      gstin: row.gstin || "",
      annualRevenue: row.annualrevenue || "",
      employeeCount: row.employeecount || row.noofemployees || "",
      source: row.source || "",
      status: validStatuses.has(rawStatus) ? rawStatus : rawStatus === "proposal_sent" ? "qualified" : "new",
      emailOpened: row.emailopened || 0,
      websiteVisits: row.websitevisits || 0,
      formSubmissions: row.formsubmissions || 0,
      lastActivityDate: row.lastactivitydate || "",
      notes: row.notes || row.note || "",
      address: {
        street: row.street || "",
        city: row.city || "",
        state: row.state || "",
        postalCode: row.postalcode || row.zip || "",
        country: row.country || "",
      },
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
        alert("CSV file must include a header row and at least one lead row.");
        return;
      }

      const headers = parseCsvLine(lines[0]).map(normalizeHeader);
      const rows = lines
        .slice(1)
        .map((line) => mapCsvRowToLead(headers, parseCsvLine(line)))
        .filter((lead) => lead.name);

      if (rows.length === 0) {
        alert("No valid leads found in the selected CSV file.");
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

  const submitNewLead = async (e) => {
    e.preventDefault();
    let leadData = null;

    const validationErrors = validateNewLeadForm(newLead);
    if (Object.keys(validationErrors).length > 0) {
      setNewLeadErrors(validationErrors);
      const firstError = Object.values(validationErrors)[0];
      if (firstError) {
        alert(firstError);
      }
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const fullName = [newLead.firstName.trim(), newLead.lastName.trim()].filter(Boolean).join(' ').trim();
      if (!fullName) {
        alert('First name is required');
        return;
      }

      leadData = {
        salutation: newLead.salutation,
        firstName: newLead.firstName,
        lastName: newLead.lastName,
        title: newLead.title,
        email: newLead.email,
        secondaryEmail: newLead.secondaryEmail,
        phone: newLead.phone,
        mobile: newLead.mobile,
        company: newLead.company,
        website: newLead.website,
        itemType: newLead.itemType,
        itemId: newLead.itemId,
        industry: newLead.industry,
        gstin: String(newLead.gstin || "").trim().toUpperCase(),
        annualRevenue: newLead.annualRevenue,
        employeeCount: newLead.employeeCount,
        source: newLead.source,
        status: newLead.status,
        notes: newLead.notes,
        address: {
          street: newLead.street,
          city: newLead.city,
          state: newLead.state,
          postalCode: newLead.postalCode,
          country: newLead.country,
        },
      };
      await axios.post(
        "http://localhost:5000/api/leads",
        leadData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowModal(false);
      fetchStats();
      fetchLeads();
    } catch (err) {
      console.error(err);
      const handled = handleDuplicateConflict(err, {
        sourceLeadId: "",
        fallbackMessage: "Duplicate lead detected",
        draftLeadData: leadData,
      });
      if (handled) return;
      alert(err.response?.data?.message || "Failed to add lead");
    }
  };

  const handleImportLeads = async () => {
    if (!importRows.length) {
      alert("Select a CSV file with lead data first.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "http://localhost:5000/api/leads/bulk",
        { leads: importRows },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowImportModal(false);
      setImportRows([]);
      setImportFileName("");
      fetchStats();
      fetchLeads();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to import leads from CSV");
    }
  };

  const handleViewLead = (lead) => {
    setSelectedLead(lead);
  };

  const buildEditLeadForm = (lead) => ({
    salutation: lead?.salutation || "",
    firstName: lead?.firstName || "",
    lastName: lead?.lastName || "",
    title: lead?.title || "",
    email: lead?.email || "",
    secondaryEmail: lead?.secondaryEmail || "",
    phone: lead?.phone || "",
    mobile: lead?.mobile || "",
    company: lead?.company || "",
    website: lead?.website || "",
    itemType: lead?.itemType || "",
    itemId: getEntityId(lead?.itemId),
    industry: lead?.industry || "",
    gstin: lead?.gstin || "",
    annualRevenue: lead?.annualRevenue ?? "",
    employeeCount: lead?.employeeCount ?? "",
    source: lead?.source || "",
    notes: lead?.notes || "",
    street: lead?.address?.street || "",
    city: lead?.address?.city || "",
    state: lead?.address?.state || "",
    postalCode: lead?.address?.postalCode || "",
    country: lead?.address?.country || "",
  });

  useEffect(() => {
    if (!selectedLead) {
      setIsEditingLead(false);
      setEditLeadForm(null);
      setEditLeadErrors({});
      return;
    }

    setIsEditingLead(false);
    setEditLeadForm(buildEditLeadForm(selectedLead));
    setEditLeadErrors({});
  }, [selectedLead]);

  const handleEditLeadFieldChange = (field, value) => {
    setEditLeadForm((prev) => {
      const next = { ...(prev || {}), [field]: value };
      if (field === "itemType") {
        next.itemId = "";
      }
      return next;
    });

    setEditLeadErrors((prev) => {
      const shouldClearContactError =
        ["email", "phone", "mobile"].includes(field) && Boolean(prev.contact);

      if (!prev[field] && !shouldClearContactError) return prev;

      const next = { ...prev };
      delete next[field];
      if (shouldClearContactError) {
        delete next.contact;
      }
      if (field === "itemType" && next.itemId) {
        delete next.itemId;
      }
      return next;
    });
  };

  const validateEditLeadForm = (lead) => {
    const errors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const gstinRegex = /^[0-9]{2}[A-Z0-9]{13}$/;
    const phoneCharsRegex = /^[+]?[-()\s0-9]{7,20}$/;
    const isValidPhoneNumber = (value) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) return true;
      if (!phoneCharsRegex.test(trimmed)) return false;

      const digitCount = trimmed.replace(/\D/g, "").length;
      return digitCount >= 10 && digitCount <= 15;
    };

    if (!String(lead.firstName || "").trim()) {
      errors.firstName = "First name is required";
    }

    if (!String(lead.lastName || "").trim()) {
      errors.lastName = "Last name is required";
    }

    const email = String(lead.email || "").trim();
    const phone = String(lead.phone || "").trim();
    const mobile = String(lead.mobile || "").trim();

    if (!email && !phone) {
      errors.contact = "Provide at least one contact detail: Email or Phone";
    }

    if (email && !emailRegex.test(email)) {
      errors.email = "Enter a valid email address";
    }

    if (String(lead.secondaryEmail || "").trim() && !emailRegex.test(String(lead.secondaryEmail || "").trim())) {
      errors.secondaryEmail = "Enter a valid secondary email";
    }

    if (!isValidPhoneNumber(phone)) {
      errors.phone = "Enter a valid phone number";
    }

    if (!isValidPhoneNumber(mobile)) {
      errors.mobile = "Enter a valid mobile number";
    }

    if (!String(lead.company || "").trim()) {
      errors.company = "Company is required";
    }

    if (!String(lead.source || "").trim()) {
      errors.source = "Lead source is required";
    }

    if (!String(lead.itemType || "").trim()) {
      errors.itemType = "Type is required";
    }

    if (String(lead.itemType || "").trim() && !["product", "service"].includes(String(lead.itemType).toLowerCase())) {
      errors.itemType = "Type must be Product or Service";
    }

    if (String(lead.itemType || "").trim() && !String(lead.itemId || "").trim()) {
      errors.itemId = `Please select a ${String(lead.itemType || "item").toLowerCase()}`;
    }

    if (String(lead.website || "").trim()) {
      try {
        const url = new URL(String(lead.website || "").trim());
        if (!["http:", "https:"].includes(url.protocol)) {
          errors.website = "Website must start with http:// or https://";
        }
      } catch {
        errors.website = "Enter a valid website URL";
      }
    }

    if (String(lead.annualRevenue || "").trim() && Number(lead.annualRevenue) < 0) {
      errors.annualRevenue = "Annual revenue cannot be negative";
    }

    const gstin = String(lead.gstin || "").trim().toUpperCase();
    if (gstin && !gstinRegex.test(gstin)) {
      errors.gstin = "GSTIN must be a valid 15-character GSTIN";
    }

    if (String(lead.employeeCount || "").trim()) {
      const count = Number(lead.employeeCount);
      if (!Number.isInteger(count) || count < 0) {
        errors.employeeCount = "Employee count must be a non-negative whole number";
      }
    }

    return errors;
  };

  const handleSaveLeadDetails = async () => {
    if (!selectedLead || !editLeadForm) return;

    const validationErrors = validateEditLeadForm(editLeadForm);
    if (Object.keys(validationErrors).length > 0) {
      setEditLeadErrors(validationErrors);
      const firstError = Object.values(validationErrors)[0];
      if (firstError) {
        alert(firstError);
      }
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const payload = {
        salutation: editLeadForm.salutation,
        firstName: editLeadForm.firstName,
        lastName: editLeadForm.lastName,
        title: editLeadForm.title,
        email: editLeadForm.email,
        secondaryEmail: editLeadForm.secondaryEmail,
        phone: editLeadForm.phone,
        mobile: editLeadForm.mobile,
        company: editLeadForm.company,
        website: editLeadForm.website,
        itemType: editLeadForm.itemType,
        itemId: editLeadForm.itemId,
        industry: editLeadForm.industry,
        gstin: String(editLeadForm.gstin || "").trim().toUpperCase(),
        annualRevenue: editLeadForm.annualRevenue,
        employeeCount: editLeadForm.employeeCount,
        source: editLeadForm.source,
        notes: editLeadForm.notes,
        address: {
          street: editLeadForm.street,
          city: editLeadForm.city,
          state: editLeadForm.state,
          postalCode: editLeadForm.postalCode,
          country: editLeadForm.country,
        },
      };

      const res = await axios.put(
        `http://localhost:5000/api/leads/${selectedLead._id}`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const updatedLead = normalizeLeadScoringForDisplay(res.data);
      setLeads((prev) => prev.map((lead) => (lead._id === updatedLead._id ? updatedLead : lead)));
      setSelectedLead(updatedLead);
      setIsEditingLead(false);
      setEditLeadErrors({});
      fetchLeads();
      fetchStats();
      alert("Lead details updated successfully.");
    } catch (err) {
      console.error(err);
      const handled = handleDuplicateConflict(err, {
        sourceLeadId: selectedLead?._id,
        fallbackMessage: "Duplicate lead detected",
      });
      if (handled) return;
      alert(err.response?.data?.message || "Failed to update lead details");
    }
  };

  const performStatusUpdate = async (leadId, newStatus, transitionReason = "") => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.put(
        `http://localhost:5000/api/leads/${leadId}`,
        { status: newStatus, transitionReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.status === 202) {
        alert(res.data?.message || "Transition request sent for approval.");
        if (res.data?.lead?._id) {
          setSelectedLead(normalizeLeadScoringForDisplay(res.data.lead));
        }
        fetchLeads();
        fetchStats();
        return;
      }

      alert(`Status updated to "${stages.find(s => s.id === newStatus)?.name || newStatus}"`);
      fetchLeads();
      fetchStats();
      setSelectedLead(null);
    } catch (err) {
      console.error(err);
      console.error("Full error:", err.response?.data);
      alert(err.response?.data?.message || err.message || "Failed to update lead status");
    }
  };

  const handleUpdateStatus = async (leadId, newStatus) => {
    if (newStatus === "converted") {
      await handleConvertLead();
      return;
    }

    // Client-side validation (matches backend)
    if (selectedLead) {
      const currentStatus = selectedLead.status;
      if (
        currentStatus !== newStatus &&
        (!allowedTransitions[currentStatus] || !allowedTransitions[currentStatus].includes(newStatus))
      ) {
        alert(
          `Invalid stage transition: from "${
            stages.find((s) => s.id === currentStatus)?.name || currentStatus
          }" to "${stages.find((s) => s.id === newStatus)?.name || newStatus}" not allowed`
        );
        return;
      }
    }

    let transitionReason = "";
    if (newStatus === "lost") {
      const reasonInput = window.prompt("Enter reason for moving this lead to Lost", "");
      if (reasonInput === null) return;
      transitionReason = String(reasonInput || "").trim();
      if (!transitionReason) {
        alert("Reason is required for Lost transition.");
        return;
      }
    }

    if (newStatus === "qualified") {
      const leadForNotes =
        (selectedLead && selectedLead._id === leadId && selectedLead) ||
        leads.find((lead) => lead._id === leadId) ||
        null;

      setPendingQualifiedStatus({
        leadId,
        newStatus,
        transitionReason,
        lead: leadForNotes,
      });
      setQualifiedNotes("");
      setShowQualifiedNotesModal(true);
      return;
    }

    await performStatusUpdate(leadId, newStatus, transitionReason);
  };

  const handleConvertLead = async () => {
    if (!selectedLead) return;

    if (selectedLead.isConverted || selectedLead.status === "converted") {
      alert("This lead is already converted.");
      return;
    }

    if (!["qualified", "proposal", "proposal_sent"].includes(selectedLead.status)) {
      alert("Lead must be in Qualified, Proposal, or Proposal Sent stage before conversion.");
      return;
    }

    if (!window.confirm("Convert this lead to a customer and create a deal?")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await axios.put(
        `http://localhost:5000/api/leads/${selectedLead._id}/convert`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const convertedLead = res.data?.lead;
      if (convertedLead?._id) {
        const normalizedLead = normalizeLeadScoringForDisplay(convertedLead);
        setLeads((prev) => prev.map((lead) => (lead._id === normalizedLead._id ? normalizedLead : lead)));
        setSelectedLead(normalizedLead);
      } else {
        fetchLeads();
      }

      fetchStats();
      alert("Lead converted successfully. Customer and deal were created.");
    } catch (err) {
      console.error(err);
      const errorMessage =
        err.response?.data?.message ||
        (typeof err.response?.data === "string" ? err.response.data : "") ||
        err.message ||
        "Conversion failed";
      alert(errorMessage);
    }
  };

  const handleAssign = async (leadId, userId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5000/api/leads/assign",
        { leadId, userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updatedLead = normalizeLeadScoringForDisplay(res.data);
      const assignedUser = userId
        ? employees.find((employee) => String(employee._id) === String(userId)) || { _id: userId }
        : null;

      setLeads((prev) =>
        prev.map((lead) => {
          if (lead._id !== leadId) return lead;

          const nextLead = updatedLead?._id ? { ...lead, ...updatedLead } : { ...lead };

          if (!getEntityId(nextLead.assignedTo) || String(getEntityId(nextLead.assignedTo)) !== String(userId || "")) {
            nextLead.assignedTo = assignedUser;
          }

          return nextLead;
        })
      );

      await Promise.all([fetchLeads(), fetchStats()]);
      // update selectedLead assignment locally if it's open
      if (selectedLead && selectedLead._id === leadId) {
        setSelectedLead((prev) => {
          if (!prev || prev._id !== leadId) return prev;
          const nextLead = updatedLead?._id ? { ...prev, ...updatedLead } : { ...prev };
          if (!getEntityId(nextLead.assignedTo) || String(getEntityId(nextLead.assignedTo)) !== String(userId || "")) {
            nextLead.assignedTo = assignedUser;
          }
          return normalizeLeadScoringForDisplay(nextLead);
        });
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to assign lead");
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:5000/api/leads/${leadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchLeads();
      fetchStats();
      setSelectedLead(null);
    } catch (err) {
      console.error(err);
      alert("Failed to delete lead");
    }
  };

  const handleTransitionApproval = async (leadId, approve) => {
    try {
      const token = localStorage.getItem("token");
      let reason = "";

      if (!approve) {
        const rejectReason = window.prompt("Enter rejection reason", "");
        if (rejectReason === null) return;
        reason = String(rejectReason || "").trim();
      }

      const res = await axios.post(
        `http://localhost:5000/api/leads/${leadId}/transition-approval`,
        { approve, reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert(res.data?.message || (approve ? "Transition approved" : "Transition rejected"));
      if (res.data?.lead?._id) {
        setSelectedLead(normalizeLeadScoringForDisplay(res.data.lead));
      }
      fetchLeads();
      fetchStats();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to process transition approval");
    }
  };

  useEffect(() => {
    setMergeLeadIds((prev) => prev.filter((leadId) => leads.some((lead) => lead._id === leadId)));
  }, [leads]);

  useEffect(() => {
    if (!mergeLeadIds.length) {
      setMergePrimaryLeadId("");
      return;
    }

    if (!mergeLeadIds.includes(mergePrimaryLeadId)) {
      setMergePrimaryLeadId(mergeLeadIds[0]);
    }
  }, [mergeLeadIds, mergePrimaryLeadId]);

  const openMergeFlow = ({ sourceLeadId, duplicateLead }) => {
    const duplicateLeadId = duplicateLead?._id;
    if (!sourceLeadId || !duplicateLeadId || sourceLeadId === duplicateLeadId) {
      return false;
    }

    const ids = [sourceLeadId, duplicateLeadId].filter(
      (leadId, index, allIds) => allIds.indexOf(leadId) === index
    );

    if (ids.length < 2) {
      return false;
    }

    if (duplicateLead?._id) {
      setLeads((prev) => {
        if (prev.some((lead) => lead._id === duplicateLead._id)) {
          return prev;
        }
          return [normalizeLeadScoringForDisplay(duplicateLead), ...prev];
      });
    }

    setMergeLeadIds(ids);
    setMergePrimaryLeadId(sourceLeadId);
    setDeleteMergedLeads(true);
    setShowMergeModal(true);
    return true;
  };

  const closeMergeModal = () => {
    setMergeLeadIds([]);
    setMergePrimaryLeadId("");
    setDeleteMergedLeads(true);
    setShowMergeModal(false);
  };

  const handleDuplicateConflict = (err, { sourceLeadId = "", fallbackMessage, draftLeadData = null }) => {
    const statusCode = err.response?.status;
    const duplicateLead = err.response?.data?.duplicateLead;
    const duplicateMessage = err.response?.data?.message || fallbackMessage;

    if (statusCode !== 409 || !duplicateLead?._id) {
      return false;
    }

    const canOpenMerge = Boolean(sourceLeadId) && sourceLeadId !== duplicateLead._id;

    setDuplicateDialog({
      isOpen: true,
      message: duplicateMessage,
      sourceLeadId,
      duplicateLead,
      canOpenMerge,
      draftLeadData,
    });

    return true;
  };

  const closeDuplicateDialog = () => {
    setDuplicateDialog({
      isOpen: false,
      message: "",
      sourceLeadId: "",
      duplicateLead: null,
      canOpenMerge: false,
      draftLeadData: null,
    });
  };

  const buildNonEmptyLeadUpdates = (payload = {}) => {
    const nonEmpty = {};
    const fields = [
      "salutation",
      "firstName",
      "lastName",
      "title",
      "email",
      "secondaryEmail",
      "phone",
      "mobile",
      "company",
      "website",
      "industry",
      "gstin",
      "annualRevenue",
      "employeeCount",
      "source",
      "notes",
    ];

    fields.forEach((field) => {
      const value = payload[field];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        nonEmpty[field] = value;
      }
    });

    if (payload.address && typeof payload.address === "object") {
      const address = {};
      ["street", "city", "state", "postalCode", "country"].forEach((key) => {
        const value = payload.address[key];
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          address[key] = value;
        }
      });
      if (Object.keys(address).length > 0) {
        nonEmpty.address = address;
      }
    }

    return nonEmpty;
  };

  const handleOpenMergeFromDuplicateDialog = async () => {
    if (duplicateDialog.canOpenMerge && duplicateDialog.sourceLeadId && duplicateDialog.duplicateLead?._id) {
      openMergeFlow({
        sourceLeadId: duplicateDialog.sourceLeadId,
        duplicateLead: duplicateDialog.duplicateLead,
      });
      closeDuplicateDialog();
      return;
    }

    if (duplicateDialog.duplicateLead?._id && duplicateDialog.draftLeadData) {
      try {
        const token = localStorage.getItem("token");
        const updatePayload = buildNonEmptyLeadUpdates(duplicateDialog.draftLeadData);
        const res = await axios.put(
          `http://localhost:5000/api/leads/${duplicateDialog.duplicateLead._id}`,
          updatePayload,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const updatedLead = normalizeLeadScoringForDisplay(res.data);
        setLeads((prev) => {
          const hasLead = prev.some((lead) => lead._id === updatedLead._id);
          if (!hasLead) return [updatedLead, ...prev];
          return prev.map((lead) => (lead._id === updatedLead._id ? updatedLead : lead));
        });
        setShowModal(false);
        setSelectedLead(updatedLead);
        fetchLeads();
        fetchStats();
        closeDuplicateDialog();
        alert("Existing duplicate lead updated using your entered data.");
        return;
      } catch (err) {
        console.error(err);
        alert(err.response?.data?.message || "Failed to merge entered data into existing lead.");
        return;
      }
    }

    if (duplicateDialog.duplicateLead?._id) {
      const duplicateRecord = leads.find((lead) => lead._id === duplicateDialog.duplicateLead._id) || duplicateDialog.duplicateLead;
      setShowModal(false);
      setSelectedLead(duplicateRecord);
    }

    closeDuplicateDialog();
  };

  const handleMergeLeads = async () => {
    if (mergeLeadIds.length < 2) {
      alert("Select at least 2 leads to merge.");
      return;
    }

    if (!mergePrimaryLeadId) {
      alert("Select a primary lead.");
      return;
    }

    const secondaryLeadIds = mergeLeadIds.filter((leadId) => leadId !== mergePrimaryLeadId);
    if (!secondaryLeadIds.length) {
      alert("Select at least one secondary lead to merge.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5000/api/leads/merge",
        {
          primaryLeadId: mergePrimaryLeadId,
          mergeLeadIds: secondaryLeadIds,
          deleteMerged: deleteMergedLeads,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const primary = normalizeLeadScoringForDisplay(res.data?.primaryLead);
      if (primary?._id) {
        setLeads((prev) => {
          const withoutMerged = prev.filter((lead) => !secondaryLeadIds.includes(lead._id));
          const replaced = withoutMerged.map((lead) => (lead._id === primary._id ? primary : lead));
          return replaced.some((lead) => lead._id === primary._id) ? replaced : [primary, ...replaced];
        });
      }

      fetchLeads();
      fetchStats();
      closeMergeModal();
      alert(res.data?.message || "Leads merged successfully.");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to merge leads.");
    }
  };

  const getLeadsByStage = (stageId) => {
    return leads.filter((lead) => {
      if (stageId === "qualified") {
        return ["qualified", "proposal", "proposal_sent"].includes(lead.status);
      }
      return lead.status === stageId;
    });
  };

  // Get stages that have leads matching the search
  const getStagesWithLeads = () => {
    if (!search.trim()) return stages;
    return stages.filter((stage) => getLeadsByStage(stage.id).length > 0);
  };

  const getSourceIcon = (source) => {
    const icons = {
      "Website": "🌐",
      "Referral": "🤝",
      "Social Media": "📱",
      "Email Campaign": "📧",
      "Cold Call": "📞",
      "Trade Show": "🎪",
      "Other": "📋"
    };
    return icons[source] || "📋";
  };

  const formatAddedDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  const formatActivityDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatLeadAgeDays = (value) => {
    if (!value) return "-";
    const createdDate = new Date(value);
    if (Number.isNaN(createdDate.getTime())) return "-";

    const diffMs = Date.now() - createdDate.getTime();
    if (diffMs < 0) return "0 days";

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return `${days} ${days === 1 ? "day" : "days"}`;
  };

  const getExportLeads = () => {
    const matchingLeads = search.trim()
      ? leads.filter((lead) =>
          [lead.name, lead.email, lead.company, lead.phone, lead.source, lead.status]
            .concat([
              lead.secondaryEmail,
              lead.mobile,
              lead.title,
              lead.website,
              lead.industry,
              lead.rating,
              lead.address?.city,
              lead.address?.state,
              lead.address?.country,
            ])
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(search.toLowerCase()))
        )
      : leads;

    if (exportView === "all") return matchingLeads;
    if (exportView === "qualified") {
      return matchingLeads.filter((lead) => ["qualified", "proposal", "proposal_sent"].includes(lead.status));
    }
    return matchingLeads.filter((lead) => lead.status === exportView);
  };

  const assignableUsers = employees.filter((user) => {
    const roleName = String(user?.role || "").toUpperCase();
    if (isAdmin) return roleName === "MANAGER";
    if (isManager) return roleName === "EMPLOYEE";
    return false;
  });

  const getSelectedExportFields = () => {
    const allowedFields = new Set(exportFieldPresets[exportFieldScope] || exportFieldPresets.custom);
    return exportFields.filter((field) => allowedFields.has(field.key));
  };

  const sanitizeFileName = (value) =>
    String(value || "leads-export")
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
      ...rows.map((lead) => fields.map((field) => escapeCsvValue(field.getValue(lead))).join(",")),
    ];
    const csvText = csvLines.join("\r\n");
    const payload = exportCharset === "utf-8" ? `\uFEFF${csvText}` : csvText;
    return new Blob([payload], { type: `text/csv;charset=${exportCharset}` });
  };

  const escapeXml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, '"')
      .replace(/'/g, '&#39;'); 

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
      ...rows.map((lead) => fields.map((field) => field.getValue(lead))),
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
  <dc:title>Leads Export</dc:title>
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
    <sheet name="Leads" sheetId="1" r:id="rId1"/>
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
      `Lead Export - ${exportViews.find((view) => view.id === exportView)?.name || "All Leads"}`,
      "",
      [
        ...fields.map((field, index) => field.label.padEnd(columnWidths[index], " ")),
      ].join(" | "),
      [
        ...fields.map((_, index) => "-".repeat(columnWidths[index])),
      ].join("-+-"),
      ...rows.map((lead) =>
        fields
          .map((field, index) => String(field.getValue(lead)).replace(/\s+/g, " ").slice(0, columnWidths[index]).padEnd(columnWidths[index], " "))
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

  const handleExportLeads = () => {
    const exportRows = getExportLeads();
    const fields = getSelectedExportFields();

    if (!exportRows.length) {
      alert("No lead records are available for the selected export view.");
      return;
    }

    const fileStem = sanitizeFileName(`leads-${exportView}-${new Date().toISOString().slice(0, 10)}`);

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
      alert("Failed to export lead records.");
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content leads-page">
        <div className="leads-fixed-top">
          {/* Header */}
          <div className="leads-header-section">
            <div className="leads-header-left">
              <h1>Leads</h1>
              <p>Manage and track your potential customers</p>
            </div>
            <div className="leads-header-right">
              <div className="create-lead-menu" ref={createMenuRef}>
                <button className="btn-primary" onClick={() => setShowCreateMenu((prev) => !prev)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Create Lead
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                {showCreateMenu && (
                  <div className="create-lead-dropdown">
                    <button type="button" className="create-lead-dropdown-item" onClick={handleAddLead}>
                      Add Lead
                    </button>
                    <button type="button" className="create-lead-dropdown-item" onClick={handleOpenImportModal}>
                      Import from CSV
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          {stats && stats.leadCounts && (
            <div className="leads-stats-row">
              <div className="stat-card-zoho">
                <div className="stat-icon stat-icon-blue">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{stats.leadCounts.new || 0}</span>
                  <span className="stat-label">New Leads</span>
                </div>
              </div>
              <div className="stat-card-zoho">
                <div className="stat-icon stat-icon-orange">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{stats.leadCounts.contacted || 0}</span>
                  <span className="stat-label">Contacted</span>
                </div>
              </div>
              <div className="stat-card-zoho">
                <div className="stat-icon stat-icon-purple">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 11 12 14 22 4"></polyline>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{stats.leadCounts.qualified || 0}</span>
                  <span className="stat-label">Qualified</span>
                </div>
              </div>
              <div className="stat-card-zoho">
                <div className="stat-icon stat-icon-green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="20" x2="12" y2="10"></line>
                    <line x1="18" y1="20" x2="18" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="16"></line>
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{stats.leadCounts.converted || 0}</span>
                  <span className="stat-label">Converted</span>
                </div>
              </div>
            </div>
          )}

          {/* Views & Filters Toolbar */}
          <div className="leads-toolbar-zoho">
            <div className="leads-view-toolbar-card">
              <div className="lead-toolbar-inner">
                <div className="search-box-zoho">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search leads by name, email, company..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <div className="views-toolbar">
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
                      <div className="lead-view-dropdown-menu" role="menu" aria-label="Lead views">
                        <button
                          type="button"
                          className={`lead-view-dropdown-item ${currentViewId === ALL_LEADS_VIEW_ID ? "active" : ""}`}
                          onClick={() => {
                            loadView(ALL_LEADS_VIEW_ID);
                            setShowViewDropdown(false);
                          }}
                        >
                          <span>All Leads</span>
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
                      value={currentViewId || ALL_LEADS_VIEW_ID}
                      onChange={(e) => loadView(e.target.value)}
                      aria-label="Lead views"
                    >
                      <option value={ALL_LEADS_VIEW_ID}>All Leads</option>
                      {views
                        .filter((view) => view.name !== "All Leads")
                        .map((view) => (
                        <option key={view._id} value={view._id}>
                          {`${view.name} 🗑`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    className="lead-toolbar-pill-button"
                    onClick={() => setShowFilterModal(true)}
                    title="Advanced Filters"
                  >
                    Filters
                  </button>

                  <button
                    type="button"
                    className="lead-toolbar-pill-button"
                    onClick={() => saveView({ mode: "update" })}
                  >
                    Save View
                  </button>

                  <button
                    type="button"
                    className="lead-toolbar-pill-button"
                    onClick={handleOpenExportModal}
                  >
                    Export
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="leads-scroll-content">

          {/* Active Filter Chips */}
          {Object.keys(filters).length > 0 && (
            <div className="filter-chips">
              {Object.entries(filters)
                .filter(([key]) => key !== "logic")
                .map(([key, value]) => (
                <span key={key} className="filter-chip">
                  {key}: {formatFilterChipValue(key, value)}
                  <button type="button" onClick={() => updateFilters({})}>x</button>
                </span>
              ))}
            </div>
          )}

          {/* Kanban Board */}
          <div className="kanban-board-zoho">
            {getStagesWithLeads().map((stage) => (
              <div key={stage.id} className="kanban-column-zoho">
                <div className="column-header-zoho" style={{ borderTopColor: stage.color }}>
                  <div className="column-title-zoho">
                    <span className="column-dot" style={{ backgroundColor: stage.color }}></span>
                    <h3>{stage.name}</h3>
                  </div>
                  <span className="lead-count-zoho">{getLeadsByStage(stage.id).length}</span>
                </div>
                <div className="column-content-zoho">
                  {getLeadsByStage(stage.id).map((lead) => {
                    const assignedToId = getEntityId(lead.assignedTo);
                    const selectedAssignTarget = cardAssignSelection[lead._id] ?? assignedToId;
                    const assignedDisplayName = getAssignedUserLabel(lead.assignedTo);
                    const assignedRole = String(lead?.assignedTo?.role || "").toUpperCase();
                    const showAsUnassigned = !assignedToId || (isManager && assignedRole === "MANAGER");

                    return (
                    <div
                      key={lead._id}
                      className="kanban-card-zoho"
                      onClick={() => handleViewLead(lead)}
                    >
                      <div className="card-top-row">
                        <h4>{lead.name}</h4>
                        <span className={`status-badge-zoho ${lead.status}`}>{lead.status}</span>
                      </div>
                      <div className="lead-score-row">
                        <span className="lead-score-pill">Score: {Number(lead.score) || 0}</span>
                        <span className={`lead-rating-pill ${(lead.rating || "cold").toLowerCase()}`}>
                          {(lead.rating || "cold").toUpperCase()}
                        </span>
                      </div>
                      {lead.company && (
                        <div className="card-company-zoho">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                          </svg>
                          {lead.company}
                        </div>
                      )}
                      <div className="card-details-zoho">
                        {lead.email && (
                          <div className="card-detail">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                              <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                            {lead.email}
                          </div>
                        )}
                        {lead.phone && (
                          <div className="card-detail">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                            {lead.phone}
                          </div>
                        )}
                      </div>
                      {lead.source && (
                        <div className="card-source">
                          <span className="source-icon">{getSourceIcon(lead.source)}</span>
                          <span className="source-text">{lead.source}</span>
                        </div>
                      )}

                      {(isAdmin || isManager) && assignableUsers.length > 0 && (
                        <div className="card-assign-inline" onClick={(event) => event.stopPropagation()}>
                          <div className="card-assigned-name">
                            <span className="card-assigned-label">Assigned</span>
                            {showAsUnassigned ? (
                              <button
                                type="button"
                                className="card-assigned-link"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  navigate("/requests");
                                }}
                              >
                                Unassigned
                              </button>
                            ) : (
                              <span className="card-assigned-value">{assignedDisplayName || "Unassigned"}</span>
                            )}
                          </div>

                          {!showAsUnassigned ? null : !assignedToId ? (
                            <>
                              <select
                                className="card-assign-select"
                                value={selectedAssignTarget}
                                onChange={(event) => {
                                  setCardAssignSelection((prev) => ({
                                    ...prev,
                                    [lead._id]: event.target.value,
                                  }));
                                }}
                              >
                                <option value="">Unassigned</option>
                                {assignableUsers.map((emp) => (
                                  <option key={emp._id} value={emp._id}>
                                    {getUserDisplayLabel(emp)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="card-assign-btn"
                                onClick={async () => {
                                  if (!selectedAssignTarget && !assignedToId) {
                                    window.alert("Please select an employee to assign this lead.");
                                    return;
                                  }

                                  await handleAssign(lead._id, selectedAssignTarget);
                                  setCardAssignSelection((prev) => {
                                    const next = { ...prev };
                                    delete next[lead._id];
                                    return next;
                                  });
                                }}
                              >
                                Assign
                              </button>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {showExportModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowExportModal(false)}>
            <div className="modal-box-zoho export-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Export Lead</h2>
                <button className="modal-close" onClick={() => setShowExportModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div className="modal-form-zoho export-modal-form">
                <div className="export-form-row">
                  <label htmlFor="export-view">Custom view</label>
                  <select id="export-view" value={exportView} onChange={(e) => setExportView(e.target.value)}>
                    {exportViews.map((view) => (
                      <option key={view.id} value={view.id}>
                        {view.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="export-form-row">
                  <label htmlFor="export-fields">Fields</label>
                  <select id="export-fields" value={exportFieldScope} onChange={(e) => setExportFieldScope(e.target.value)}>
                    <option value="custom">Fields from custom view</option>
                    <option value="basic">Basic fields</option>
                    <option value="all">All fields</option>
                  </select>
                </div>
                <div className="export-form-row export-type-row">
                  <label>Choose File Type</label>
                  <div className="export-type-options">
                    <label className="export-radio-option">
                      <input type="radio" name="export-type" value="csv" checked={exportType === "csv"} onChange={(e) => setExportType(e.target.value)} />
                      <span>CSV</span>
                    </label>
                    <label className="export-radio-option">
                      <input type="radio" name="export-type" value="xlsx" checked={exportType === "xlsx"} onChange={(e) => setExportType(e.target.value)} />
                      <span>XLSX</span>
                    </label>
                    <label className="export-radio-option">
                      <input type="radio" name="export-type" value="pdf" checked={exportType === "pdf"} onChange={(e) => setExportType(e.target.value)} />
                      <span>PDF</span>
                    </label>
                  </div>
                </div>
                <div className="export-form-row">
                  <label htmlFor="export-charset">Charset</label>
                  <select id="export-charset" value={exportCharset} onChange={(e) => setExportCharset(e.target.value)} disabled={exportType !== "csv"}>
                    <option value="utf-8">UTF-8 (Unicode)</option>
                    <option value="us-ascii">US-ASCII</option>
                  </select>
                </div>
                <div className="export-note-box">
                  {`You can export ${getExportLeads().length.toLocaleString()} lead record(s) from this view.`}
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowExportModal(false)}>Cancel</button>
                  <button type="button" className="btn-submit" onClick={handleExportLeads}>Export</button>
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
                <button className="modal-close" onClick={() => setShowFilterModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div className="modal-form-zoho">
                <FilterBuilder
                  filters={filters}
                  onChange={setFilters}
                  onApply={(nextFilters) => {
                    setFilters(nextFilters);
                    fetchFilteredLeads(nextFilters, sortConfig);
                    setShowFilterModal(false);
                  }}
                  onClear={() => {
                    updateFilters({});
                    setShowFilterModal(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {duplicateDialog.isOpen && (
          <div className="modal-overlay-zoho" onClick={closeDuplicateDialog}>
            <div className="modal-box-zoho duplicate-dialog-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Duplicate Lead Detected</h2>
                <button className="modal-close" onClick={closeDuplicateDialog}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="modal-form-zoho duplicate-dialog-content">
                <p className="duplicate-dialog-message">{duplicateDialog.message}</p>
                <p className="duplicate-dialog-subtext">
                  {duplicateDialog.canOpenMerge
                    ? "You can open Merge and combine current lead with the duplicate record."
                    : "Current lead is not saved yet. We can apply your entered non-empty fields to the existing duplicate lead."}
                </p>

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeDuplicateDialog}>
                    Cancel
                  </button>
                  <button type="button" className="btn-submit" onClick={handleOpenMergeFromDuplicateDialog}>
                    {duplicateDialog.canOpenMerge ? "Open Merge" : "Merge Into Existing"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showMergeModal && (isAdmin || isManager) && (
          <div className="modal-overlay-zoho" onClick={closeMergeModal}>
            <div className="modal-box-zoho merge-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Merge Leads</h2>
                <button className="modal-close" onClick={closeMergeModal}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="modal-form-zoho">
                <p className="merge-helper-text">
                  Duplicate detected. Choose the primary lead record to keep and merge into.
                </p>

                {mergeLeadIds.length < 2 ? (
                  <p className="merge-empty-text">No duplicate lead pair available for merging right now.</p>
                ) : (
                  <>
                    <div className="merge-lead-list">
                      {mergeLeadIds
                        .map((leadId) => leads.find((lead) => lead._id === leadId))
                        .filter(Boolean)
                        .map((lead) => (
                          <label key={lead._id} className="merge-lead-row">
                            <input
                              type="radio"
                              name="merge-primary"
                              checked={mergePrimaryLeadId === lead._id}
                              onChange={() => setMergePrimaryLeadId(lead._id)}
                            />
                            <div className="merge-lead-content">
                              <strong>{lead.name || "Unnamed Lead"}</strong>
                              <span>{lead.company || "No company"}</span>
                              <span>{lead.email || "No email"}</span>
                            </div>
                          </label>
                        ))}
                    </div>

                    <label className="merge-delete-toggle">
                      <input
                        type="checkbox"
                        checked={deleteMergedLeads}
                        onChange={(e) => setDeleteMergedLeads(e.target.checked)}
                      />
                      <span>Delete merged duplicate records (recommended)</span>
                    </label>
                  </>
                )}

                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={closeMergeModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-submit"
                    disabled={mergeLeadIds.length < 2 || !mergePrimaryLeadId}
                    onClick={handleMergeLeads}
                  >
                    Merge Selected Leads
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Lead Modal */}
        {showModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Create New Lead</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <form onSubmit={submitNewLead} className="modal-form-zoho">
                <div className="form-section">
                  <h3>Basic Information</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Salutation</label>
                      <select
                        value={newLead.salutation}
                        onChange={(e) => setNewLead({ ...newLead, salutation: e.target.value })}
                      >
                        <option value="">Salutation</option>
                        {salutations.map((salutation) => (
                          <option key={salutation} value={salutation}>{salutation}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>
                        First Name <span className="required-star">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Enter first name"
                        value={newLead.firstName}
                        onChange={(e) => setNewLeadField("firstName", e.target.value)}
                        className={newLeadErrors.firstName ? "form-input-error" : ""}
                        required
                      />
                      {newLeadErrors.firstName && <span className="form-error-text">{newLeadErrors.firstName}</span>}
                    </div>
                    <div className="form-group">
                      <label>
                        Last Name <span className="required-star">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Enter last name"
                        value={newLead.lastName}
                        onChange={(e) => setNewLeadField("lastName", e.target.value)}
                        className={newLeadErrors.lastName ? "form-input-error" : ""}
                        required
                      />
                      {newLeadErrors.lastName && <span className="form-error-text">{newLeadErrors.lastName}</span>}
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Title</label>
                      <input
                        type="text"
                        placeholder="Enter job title"
                        value={newLead.title}
                        onChange={(e) => setNewLead({ ...newLead, title: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>
                        Email <span className="required-star">*</span>
                      </label>
                      <input
                        type="email"
                        placeholder="Enter email address"
                        value={newLead.email}
                        onChange={(e) => setNewLeadField("email", e.target.value)}
                        className={newLeadErrors.email ? "form-input-error" : ""}
                      />
                      {newLeadErrors.email && <span className="form-error-text">{newLeadErrors.email}</span>}
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Secondary Email</label>
                      <input
                        type="email"
                        placeholder="Enter secondary email"
                        value={newLead.secondaryEmail}
                        onChange={(e) => setNewLeadField("secondaryEmail", e.target.value)}
                        className={newLeadErrors.secondaryEmail ? "form-input-error" : ""}
                      />
                      {newLeadErrors.secondaryEmail && <span className="form-error-text">{newLeadErrors.secondaryEmail}</span>}
                    </div>
                    <div className="form-group">
                      <label>
                        Phone <span className="required-star">*</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="Enter phone number"
                        value={newLead.phone}
                        onChange={(e) => setNewLeadField("phone", e.target.value)}
                        className={newLeadErrors.phone ? "form-input-error" : ""}
                        maxLength={20}
                      />
                      {newLeadErrors.phone && <span className="form-error-text">{newLeadErrors.phone}</span>}
                    </div>
                    <div className="form-group">
                      <label>Mobile</label>
                      <input
                        type="tel"
                        placeholder="Enter mobile number"
                        value={newLead.mobile}
                        onChange={(e) => setNewLeadField("mobile", e.target.value)}
                        className={newLeadErrors.mobile ? "form-input-error" : ""}
                        maxLength={20}
                      />
                      {newLeadErrors.mobile && <span className="form-error-text">{newLeadErrors.mobile}</span>}
                    </div>
                  </div>
                  {newLeadErrors.contact && <span className="form-error-text">{newLeadErrors.contact}</span>}
                </div>
                <div className="form-section">
                  <h3>Additional Details</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>
                        Company <span className="required-star">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="Enter company name"
                        value={newLead.company}
                        onChange={(e) => setNewLeadField("company", e.target.value)}
                        className={newLeadErrors.company ? "form-input-error" : ""}
                        required
                      />
                      {newLeadErrors.company && <span className="form-error-text">{newLeadErrors.company}</span>}
                    </div>
                    <div className="form-group">
                      <label>Website</label>
                      <input
                        type="url"
                        placeholder="https://example.com"
                        value={newLead.website}
                        onChange={(e) => setNewLeadField("website", e.target.value)}
                        className={newLeadErrors.website ? "form-input-error" : ""}
                      />
                      {newLeadErrors.website && <span className="form-error-text">{newLeadErrors.website}</span>}
                    </div>
                    <div className="form-group">
                      <label>
                        Lead Source <span className="required-star">*</span>
                      </label>
                      <select
                        value={newLead.source}
                        onChange={(e) => setNewLeadField("source", e.target.value)}
                        className={newLeadErrors.source ? "form-input-error" : ""}
                        required
                      >
                        <option value="">Select source</option>
                        {sources.map((source) => (
                          <option key={source} value={source}>{source}</option>
                        ))}
                      </select>
                      {newLeadErrors.source && <span className="form-error-text">{newLeadErrors.source}</span>}
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>
                        Type <span className="required-star">*</span>
                      </label>
                      <select
                        value={newLead.itemType}
                        onChange={(e) => setNewLeadField("itemType", e.target.value)}
                        className={newLeadErrors.itemType ? "form-input-error" : ""}
                        required
                      >
                        <option value="">Select type</option>
                        <option value="product">Product</option>
                        <option value="service">Service</option>
                      </select>
                      {newLeadErrors.itemType && <span className="form-error-text">{newLeadErrors.itemType}</span>}
                    </div>

                    {newLead.itemType ? (
                      <div className="form-group">
                        <label>{newLead.itemType === "product" ? "Product" : "Service"}</label>
                        <select
                          value={newLead.itemId}
                          onChange={(e) => setNewLeadField("itemId", e.target.value)}
                          className={newLeadErrors.itemId ? "form-input-error" : ""}
                          disabled={loadingLeadItems}
                        >
                          <option value="">
                            {loadingLeadItems ? "Loading..." : `Select ${newLead.itemType === "product" ? "product" : "service"}`}
                          </option>
                          {leadItems
                            .filter((item) => item.type === newLead.itemType)
                            .map((item) => (
                              <option key={item._id} value={item._id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                        {newLeadErrors.itemId && <span className="form-error-text">{newLeadErrors.itemId}</span>}
                      </div>
                    ) : (
                      <div className="form-group">
                        <label>Selection</label>
                        <input type="text" value="Choose type first" readOnly />
                      </div>
                    )}
                  </div>

                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Industry</label>
                      <select
                        value={newLead.industry}
                        onChange={(e) => setNewLead({ ...newLead, industry: e.target.value })}
                      >
                        <option value="">Select industry</option>
                        {industries.map((industry) => (
                          <option key={industry} value={industry}>{industry}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>GSTIN</label>
                      <input
                        type="text"
                        placeholder="Enter GSTIN"
                        value={newLead.gstin}
                        onChange={(e) => setNewLeadField("gstin", e.target.value.toUpperCase())}
                        className={newLeadErrors.gstin ? "form-input-error" : ""}
                        maxLength={15}
                      />
                      {newLeadErrors.gstin && <span className="form-error-text">{newLeadErrors.gstin}</span>}
                    </div>
                    <div className="form-group">
                      <label>Annual Revenue</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Enter annual revenue"
                        value={newLead.annualRevenue}
                        onChange={(e) => setNewLeadField("annualRevenue", e.target.value)}
                        className={newLeadErrors.annualRevenue ? "form-input-error" : ""}
                      />
                      {newLeadErrors.annualRevenue && <span className="form-error-text">{newLeadErrors.annualRevenue}</span>}
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Employee Count</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Enter employee count"
                        value={newLead.employeeCount}
                        onChange={(e) => setNewLeadField("employeeCount", e.target.value)}
                        className={newLeadErrors.employeeCount ? "form-input-error" : ""}
                      />
                      {newLeadErrors.employeeCount && <span className="form-error-text">{newLeadErrors.employeeCount}</span>}
                    </div>
                    <div className="form-group">
                      <label>Score</label>
                      <input type="text" value="0" readOnly />
                    </div>
                    <div className="form-group">
                      <label>Rating</label>
                      <input type="text" value="COLD" readOnly />
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Lead Stage</label>
                      <input type="text" value="New" readOnly />
                    </div>
                    <div className="form-group">
                      <label>Notes</label>
                      <textarea
                        placeholder="Enter lead notes"
                        value={newLead.notes}
                        onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                        rows="3"
                      />
                    </div>
                  </div>
                </div>
                <div className="form-section">
                  <h3>Address</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Street</label>
                      <input
                        type="text"
                        placeholder="Enter street"
                        value={newLead.street}
                        onChange={(e) => setNewLead({ ...newLead, street: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>City</label>
                      <input
                        type="text"
                        placeholder="Enter city"
                        value={newLead.city}
                        onChange={(e) => setNewLead({ ...newLead, city: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Country</label>
                      <select
                        value={newLead.country}
                        onChange={(e) => handleNewLeadCountryChange(e.target.value)}
                      >
                        <option value="">Select country</option>
                        {countryOptions.map((country) => (
                          <option key={country} value={country}>{country}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>State</label>
                      <select
                        value={newLead.state}
                        onChange={(e) => setNewLeadField("state", e.target.value)}
                        disabled={!newLead.country}
                      >
                        <option value="">{newLead.country ? "Select state" : "Select country first"}</option>
                        {getStateOptionsForCountry(newLead.country).map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Postal Code</label>
                      <input
                        type="text"
                        placeholder="Enter postal code"
                        value={newLead.postalCode}
                        onChange={(e) => setNewLead({ ...newLead, postalCode: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit">Create Lead</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showImportModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowImportModal(false)}>
            <div className="modal-box-zoho import-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Import Leads from CSV</h2>
                <button className="modal-close" onClick={() => setShowImportModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div className="modal-form-zoho">
                <div className="form-section">
                  <h3>Upload CSV File</h3>
                  <p className="import-helper-text">
                    Supported headers: `name`, `salutation`, `firstName`, `lastName`, `title`, `email`, `secondaryEmail`, `phone`, `mobile`, `company`, `website`, `industry`, `gstin`, `annualRevenue`, `employeeCount`, `source`, `status`, `notes`, `street`, `city`, `state`, `postalCode`, `country`, `emailOpened`, `websiteVisits`, `formSubmissions`, `lastActivityDate`.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="csv-file-input"
                    onChange={handleCsvFileChange}
                  />
                  {importFileName && (
                    <div className="import-file-summary">
                      <span>{importFileName}</span>
                      <span>{importRows.length} lead(s) ready</span>
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
                            <th>Email</th>
                            <th>Company</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.slice(0, 5).map((lead, index) => (
                            <tr key={`${lead.email}-${index}`}>
                              <td>{lead.name}</td>
                              <td>{lead.email || "-"}</td>
                              <td>{lead.company || "-"}</td>
                              <td>{lead.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {importRows.length > 5 && (
                      <p className="import-helper-text">Showing first 5 rows of {importRows.length} leads.</p>
                    )}
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowImportModal(false)}>Cancel</button>
                  <button type="button" className="btn-submit" onClick={handleImportLeads}>Import Leads</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View/Edit Lead Modal */}
        {selectedLead && (
          <div className="modal-overlay-zoho" onClick={() => setSelectedLead(null)}>
            <div className="modal-box-zoho modal-view" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>{selectedLead.name}</h2>
                <button className="modal-close" onClick={() => setSelectedLead(null)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div className="modal-actions" style={{ justifyContent: "flex-end", marginBottom: "8px" }}>
                {!isEditingLead ? (
                  <button
                    type="button"
                    className="btn-submit"
                    onClick={() => {
                      setEditLeadErrors({});
                      setIsEditingLead(true);
                    }}
                  >
                    Edit Details
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => {
                        setEditLeadForm(buildEditLeadForm(selectedLead));
                        setEditLeadErrors({});
                        setIsEditingLead(false);
                      }}
                    >
                      Cancel
                    </button>
                    <button type="button" className="btn-submit" onClick={handleSaveLeadDetails}>
                      Save Changes
                    </button>
                  </>
                )}
              </div>

              {!isEditingLead && (
                <>

          {showQualifiedNotesModal && pendingQualifiedStatus && (
            <div
              className="modal-overlay-zoho"
              onClick={() => {
                setShowQualifiedNotesModal(false);
                setPendingQualifiedStatus(null);
                setQualifiedNotes("");
              }}
            >
              <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header-zoho">
                  <h2>Meeting Notes for Qualified Lead</h2>
                  <button
                    className="modal-close"
                    onClick={() => {
                      setShowQualifiedNotesModal(false);
                      setPendingQualifiedStatus(null);
                      setQualifiedNotes("");
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <div className="modal-form-zoho">
                  <div className="form-group">
                    <label>What happened in this meeting?</label>
                    <textarea
                      value={qualifiedNotes}
                      onChange={(e) => setQualifiedNotes(e.target.value)}
                      rows={5}
                      placeholder="Add detailed notes about the discussion, objections, and next steps."
                    />
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => {
                        setShowQualifiedNotesModal(false);
                        setPendingQualifiedStatus(null);
                        setQualifiedNotes("");
                      }}
                      disabled={isSavingQualifiedNotes}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-submit"
                      onClick={async () => {
                        if (!pendingQualifiedStatus) return;

                        const notes = String(qualifiedNotes || "").trim();
                        if (!notes) {
                          alert("Please fill notes about the meeting before moving the lead to Qualified.");
                          return;
                        }

                        setIsSavingQualifiedNotes(true);
                        try {
                          const token = localStorage.getItem("token");
                          const leadId = pendingQualifiedStatus.leadId;
                          const leadForNotes =
                            pendingQualifiedStatus.lead ||
                            (selectedLead && selectedLead._id === leadId && selectedLead) ||
                            leads.find((lead) => lead._id === leadId) ||
                            null;

                          const leadName =
                            (leadForNotes && (leadForNotes.name || leadForNotes.company || leadForNotes.email)) ||
                            "Lead";

                          const activityPayload = {
                            activityType: "meeting",
                            title: `Qualified Meeting - ${leadName}`,
                            description: notes,
                            notes,
                            relatedType: "Lead",
                            relatedId: leadId,
                            status: "Completed",
                            stage: "qualified",
                          };

                          await axios.post("http://localhost:5000/api/activities", activityPayload, {
                            headers: { Authorization: `Bearer ${token}` },
                          });

                          await performStatusUpdate(
                            pendingQualifiedStatus.leadId,
                            pendingQualifiedStatus.newStatus,
                            pendingQualifiedStatus.transitionReason || ""
                          );

                          setShowQualifiedNotesModal(false);
                          setPendingQualifiedStatus(null);
                          setQualifiedNotes("");
                        } catch (error) {
                          console.error(error);
                          alert(
                            error.response?.data?.message ||
                              "Failed to save meeting notes. Lead status was not updated."
                          );
                        } finally {
                          setIsSavingQualifiedNotes(false);
                        }
                      }}
                      disabled={isSavingQualifiedNotes}
                    >
                      {isSavingQualifiedNotes ? "Saving..." : "Save & Move to Qualified"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
                <div className="lead-details-view">
                  <div className="detail-row">
                    <span className="detail-label">Salutation</span>
                    <span className="detail-value">{selectedLead.salutation || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Title</span>
                    <span className="detail-value">{selectedLead.title || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Company</span>
                    <span className="detail-value">{selectedLead.company || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Email</span>
                    <span className="detail-value">{selectedLead.email || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Secondary Email</span>
                    <span className="detail-value">{selectedLead.secondaryEmail || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Phone</span>
                    <span className="detail-value">{selectedLead.phone || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Mobile</span>
                    <span className="detail-value">{selectedLead.mobile || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Website</span>
                    <span className="detail-value">{selectedLead.website || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Type</span>
                    <span className="detail-value">
                      {selectedLead.itemType
                        ? `${String(selectedLead.itemType).charAt(0).toUpperCase()}${String(selectedLead.itemType).slice(1)}`
                        : "-"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">
                      {selectedLead.itemType === "service" ? "Service" : "Product"}
                    </span>
                    <span className="detail-value">{getLeadItemName(selectedLead)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Industry</span>
                    <span className="detail-value">{selectedLead.industry || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Annual Revenue</span>
                    <span className="detail-value">{selectedLead.annualRevenue ?? "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Employee Count</span>
                    <span className="detail-value">{selectedLead.employeeCount ?? "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Source</span>
                    <span className="detail-value">{selectedLead.source || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Score</span>
                    <span className="detail-value">{Number(selectedLead.score) || 0}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Priority</span>
                    <span className={`lead-rating-pill ${(selectedLead.rating || "cold").toLowerCase()}`}>
                      {(selectedLead.rating || "cold").toUpperCase()}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Last Activity</span>
                    <span className="detail-value">
                      {formatActivityDate(selectedLead.lastActivityAt || selectedLead.lastActivityDate)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Lead Age</span>
                    <span className="detail-value">{formatLeadAgeDays(selectedLead.createdAt)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Address</span>
                    <span className="detail-value">
                      {[selectedLead.address?.street, selectedLead.address?.city, selectedLead.address?.state, selectedLead.address?.postalCode, selectedLead.address?.country]
                        .filter(Boolean)
                        .join(", ") || "-"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Status</span>
                    <span className={`status-badge-zoho ${selectedLead.status}`}>{selectedLead.status}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Notes</span>
                    <span className="detail-value">{selectedLead.notes || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Added On</span>
                    <span className="detail-value">{formatAddedDate(selectedLead.createdAt)}</span>
                  </div>
                </div>
                </>
              )}

              {isEditingLead && editLeadForm && (
                <div className="modal-form-zoho">
                  <div className="form-section">
                    <h3>Basic Information</h3>
                    <div className="form-row-zoho">
                      <div className="form-group">
                        <label>Salutation</label>
                        <select value={editLeadForm.salutation} onChange={(e) => handleEditLeadFieldChange("salutation", e.target.value)}>
                          <option value="">Salutation</option>
                          {salutations.map((salutation) => (
                            <option key={salutation} value={salutation}>{salutation}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>
                          First Name <span className="required-star">*</span>
                        </label>
                        <input
                          type="text"
                          value={editLeadForm.firstName}
                          onChange={(e) => handleEditLeadFieldChange("firstName", e.target.value)}
                          className={editLeadErrors.firstName ? "form-input-error" : ""}
                          required
                        />
                        {editLeadErrors.firstName && <span className="form-error-text">{editLeadErrors.firstName}</span>}
                      </div>
                      <div className="form-group">
                        <label>
                          Last Name <span className="required-star">*</span>
                        </label>
                        <input
                          type="text"
                          value={editLeadForm.lastName}
                          onChange={(e) => handleEditLeadFieldChange("lastName", e.target.value)}
                          className={editLeadErrors.lastName ? "form-input-error" : ""}
                          required
                        />
                        {editLeadErrors.lastName && <span className="form-error-text">{editLeadErrors.lastName}</span>}
                      </div>
                    </div>

                    <div className="form-row-zoho">
                      <div className="form-group">
                        <label>Title</label>
                        <input type="text" value={editLeadForm.title} onChange={(e) => handleEditLeadFieldChange("title", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>
                          Email <span className="required-star">*</span>
                        </label>
                        <input
                          type="email"
                          value={editLeadForm.email}
                          onChange={(e) => handleEditLeadFieldChange("email", e.target.value)}
                          className={editLeadErrors.email ? "form-input-error" : ""}
                        />
                        {editLeadErrors.email && <span className="form-error-text">{editLeadErrors.email}</span>}
                      </div>
                    </div>

                    <div className="form-row-zoho">
                      <div className="form-group">
                        <label>Secondary Email</label>
                        <input
                          type="email"
                          value={editLeadForm.secondaryEmail}
                          onChange={(e) => handleEditLeadFieldChange("secondaryEmail", e.target.value)}
                          className={editLeadErrors.secondaryEmail ? "form-input-error" : ""}
                        />
                        {editLeadErrors.secondaryEmail && <span className="form-error-text">{editLeadErrors.secondaryEmail}</span>}
                      </div>
                      <div className="form-group">
                        <label>
                          Phone <span className="required-star">*</span>
                        </label>
                        <input
                          type="tel"
                          value={editLeadForm.phone}
                          onChange={(e) => handleEditLeadFieldChange("phone", e.target.value)}
                          className={editLeadErrors.phone ? "form-input-error" : ""}
                          maxLength={20}
                        />
                        {editLeadErrors.phone && <span className="form-error-text">{editLeadErrors.phone}</span>}
                      </div>
                      <div className="form-group">
                        <label>Mobile</label>
                        <input
                          type="tel"
                          value={editLeadForm.mobile}
                          onChange={(e) => handleEditLeadFieldChange("mobile", e.target.value)}
                          className={editLeadErrors.mobile ? "form-input-error" : ""}
                          maxLength={20}
                        />
                        {editLeadErrors.mobile && <span className="form-error-text">{editLeadErrors.mobile}</span>}
                      </div>
                    </div>
                    {editLeadErrors.contact && <span className="form-error-text">{editLeadErrors.contact}</span>}
                  </div>

                  <div className="form-section">
                    <h3>Additional Details</h3>
                    <div className="form-row-zoho">
                      <div className="form-group">
                        <label>
                          Company <span className="required-star">*</span>
                        </label>
                        <input
                          type="text"
                          value={editLeadForm.company}
                          onChange={(e) => handleEditLeadFieldChange("company", e.target.value)}
                          className={editLeadErrors.company ? "form-input-error" : ""}
                          required
                        />
                        {editLeadErrors.company && <span className="form-error-text">{editLeadErrors.company}</span>}
                      </div>
                      <div className="form-group">
                        <label>Website</label>
                        <input
                          type="url"
                          value={editLeadForm.website}
                          onChange={(e) => handleEditLeadFieldChange("website", e.target.value)}
                          className={editLeadErrors.website ? "form-input-error" : ""}
                        />
                        {editLeadErrors.website && <span className="form-error-text">{editLeadErrors.website}</span>}
                      </div>
                      <div className="form-group">
                        <label>
                          Lead Source <span className="required-star">*</span>
                        </label>
                        <select
                          value={editLeadForm.source}
                          onChange={(e) => handleEditLeadFieldChange("source", e.target.value)}
                          className={editLeadErrors.source ? "form-input-error" : ""}
                          required
                        >
                          <option value="">Select source</option>
                          {sources.map((source) => (
                            <option key={source} value={source}>{source}</option>
                          ))}
                        </select>
                        {editLeadErrors.source && <span className="form-error-text">{editLeadErrors.source}</span>}
                      </div>
                    </div>

                    <div className="form-row-zoho">
                      <div className="form-group">
                        <label>
                          Type <span className="required-star">*</span>
                        </label>
                        <select
                          value={editLeadForm.itemType}
                          onChange={(e) => handleEditLeadFieldChange("itemType", e.target.value)}
                          className={editLeadErrors.itemType ? "form-input-error" : ""}
                          required
                        >
                          <option value="">Select type</option>
                          <option value="product">Product</option>
                          <option value="service">Service</option>
                        </select>
                        {editLeadErrors.itemType && <span className="form-error-text">{editLeadErrors.itemType}</span>}
                      </div>

                      {editLeadForm.itemType ? (
                        <div className="form-group">
                          <label>{editLeadForm.itemType === "product" ? "Product" : "Service"}</label>
                          <select
                            value={editLeadForm.itemId}
                            onChange={(e) => handleEditLeadFieldChange("itemId", e.target.value)}
                            className={editLeadErrors.itemId ? "form-input-error" : ""}
                            disabled={loadingLeadItems}
                          >
                            <option value="">
                              {loadingLeadItems ? "Loading..." : `Select ${editLeadForm.itemType === "product" ? "product" : "service"}`}
                            </option>
                            {leadItems
                              .filter((item) => item.type === editLeadForm.itemType)
                              .map((item) => (
                                <option key={item._id} value={item._id}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                          {editLeadErrors.itemId && <span className="form-error-text">{editLeadErrors.itemId}</span>}
                        </div>
                      ) : (
                        <div className="form-group">
                          <label>Selection</label>
                          <input type="text" value="Choose type first" readOnly />
                        </div>
                      )}
                    </div>

                    <div className="form-row-zoho">
                      <div className="form-group">
                        <label>Industry</label>
                        <select value={editLeadForm.industry} onChange={(e) => handleEditLeadFieldChange("industry", e.target.value)}>
                          <option value="">Select industry</option>
                          {industries.map((industry) => (
                            <option key={industry} value={industry}>{industry}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>GSTIN</label>
                        <input
                          type="text"
                          value={editLeadForm.gstin}
                          onChange={(e) => handleEditLeadFieldChange("gstin", e.target.value.toUpperCase())}
                          className={editLeadErrors.gstin ? "form-input-error" : ""}
                          maxLength={15}
                        />
                        {editLeadErrors.gstin && <span className="form-error-text">{editLeadErrors.gstin}</span>}
                      </div>
                      <div className="form-group">
                        <label>Annual Revenue</label>
                        <input
                          type="number"
                          min="0"
                          value={editLeadForm.annualRevenue}
                          onChange={(e) => handleEditLeadFieldChange("annualRevenue", e.target.value)}
                          className={editLeadErrors.annualRevenue ? "form-input-error" : ""}
                        />
                        {editLeadErrors.annualRevenue && <span className="form-error-text">{editLeadErrors.annualRevenue}</span>}
                      </div>
                      <div className="form-group">
                        <label>Employee Count</label>
                        <input
                          type="number"
                          min="0"
                          value={editLeadForm.employeeCount}
                          onChange={(e) => handleEditLeadFieldChange("employeeCount", e.target.value)}
                          className={editLeadErrors.employeeCount ? "form-input-error" : ""}
                        />
                        {editLeadErrors.employeeCount && <span className="form-error-text">{editLeadErrors.employeeCount}</span>}
                      </div>
                    </div>

                    <div className="form-row-zoho">
                      <div className="form-group">
                        <label>Score</label>
                        <input type="text" value={Number(selectedLead?.score) || 0} readOnly />
                      </div>
                      <div className="form-group">
                        <label>Rating</label>
                        <input type="text" value={(selectedLead?.rating || "cold").toUpperCase()} readOnly />
                      </div>
                      <div className="form-group">
                        <label>Notes</label>
                        <textarea value={editLeadForm.notes} rows="3" onChange={(e) => handleEditLeadFieldChange("notes", e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="form-section">
                    <h3>Address</h3>
                    <div className="form-row-zoho">
                      <div className="form-group">
                        <label>Street</label>
                        <input type="text" value={editLeadForm.street} onChange={(e) => handleEditLeadFieldChange("street", e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>City</label>
                        <input type="text" value={editLeadForm.city} onChange={(e) => handleEditLeadFieldChange("city", e.target.value)} />
                      </div>
                    </div>
                    <div className="form-row-zoho">
                      <div className="form-group">
                        <label>Country</label>
                        <select value={editLeadForm.country} onChange={(e) => handleEditLeadCountryChange(e.target.value)}>
                          <option value="">Select country</option>
                          {countryOptions.map((country) => (
                            <option key={country} value={country}>{country}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>State</label>
                        <select value={editLeadForm.state} onChange={(e) => handleEditLeadFieldChange("state", e.target.value)} disabled={!editLeadForm.country}>
                          <option value="">{editLeadForm.country ? "Select state" : "Select country first"}</option>
                          {getStateOptionsForCountry(editLeadForm.country).map((state) => (
                            <option key={state} value={state}>{state}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Postal Code</label>
                        <input type="text" value={editLeadForm.postalCode} onChange={(e) => handleEditLeadFieldChange("postalCode", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <button className="delete-btn-zoho" onClick={() => handleDeleteLead(selectedLead._id)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete Lead
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Leads;


