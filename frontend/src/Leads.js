
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Leads.css";
import Sidebar from "./Sidebar";
import RecordActivityPanel from "./RecordActivityPanel";

function Leads() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [exportView, setExportView] = useState("all");
  const [exportFieldScope, setExportFieldScope] = useState("custom");
  const [exportType, setExportType] = useState("csv");
  const [exportCharset, setExportCharset] = useState("utf-8");
  const createMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const [newLead, setNewLead] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    source: "",
    status: "new",
  });
  // compute role flags for UI
  const role = localStorage.getItem("role")?.toUpperCase();
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";

  const [employees, setEmployees] = useState([]);

  const fetchEmployees = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/employees", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployees(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const navigate = useNavigate();

  const stages = [
    { id: "new", name: "New", color: "#3b82f6" },
    { id: "contacted", name: "Contacted", color: "#f59e0b" },
    { id: "qualified", name: "Qualified", color: "#8b5cf6" },
    { id: "proposal", name: "Proposal", color: "#ec4899" },
    { id: "converted", name: "Converted", color: "#10b981" },
    { id: "lost", name: "Lost", color: "#ef4444" },
  ];

  const sources = ["Website", "Referral", "Social Media", "Email Campaign", "Cold Call", "Trade Show", "Other"];
  const exportViews = [{ id: "all", name: "All Leads" }, ...stages.map((stage) => ({ id: stage.id, name: `${stage.name} Leads` }))];
  const exportFieldPresets = {
    custom: ["name", "email", "phone", "company", "source", "status"],
    basic: ["name", "email", "company", "status"],
    all: ["name", "email", "phone", "company", "source", "status", "assignedTo", "createdAt"],
  };
  const exportFields = [
    { key: "name", label: "Lead Name", getValue: (lead) => lead.name || "-" },
    { key: "email", label: "Email", getValue: (lead) => lead.email || "-" },
    { key: "phone", label: "Phone", getValue: (lead) => lead.phone || "-" },
    { key: "company", label: "Company", getValue: (lead) => lead.company || "-" },
    { key: "source", label: "Source", getValue: (lead) => lead.source || "-" },
    { key: "status", label: "Status", getValue: (lead) => lead.status || "-" },
    {
      key: "assignedTo",
      label: "Assigned To",
      getValue: (lead) => {
        const assignedUser = employees.find((employee) => employee._id === lead.assignedTo);
        return assignedUser ? assignedUser.username : "Unassigned";
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
      setLeads(res.data);
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
    const handleClickOutside = (event) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target)) {
        setShowCreateMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddLead = () => {
    setNewLead({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      company: "",
      source: "",
      status: "new",
    });
    setShowModal(true);
    setShowCreateMenu(false);
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
      name: fullName,
      email: row.email || "",
      phone: row.phone || row.mobile || "",
      company: row.company || row.organization || "",
      source: row.source || "",
      status: validStatuses.has(rawStatus) ? rawStatus : "new",
      notes: row.notes || row.note || "",
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
    try {
      const token = localStorage.getItem("token");
      const leadData = {
        name: `${newLead.firstName} ${newLead.lastName}`,
        email: newLead.email,
        phone: newLead.phone,
        company: newLead.company,
        source: newLead.source,
        status: newLead.status,
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

  const handleUpdateStatus = async (leadId, newStatus) => {
    try {
      const token = localStorage.getItem("token");
      const leadToConvert = leads.find((lead) => lead._id === leadId);
      await axios.put(
        `http://localhost:5000/api/leads/${leadId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // When a lead is converted, create matching records in Mongo deals and contacts collections.
      if (newStatus === "converted" && leadToConvert) {
        const newDeal = {
          sourceLeadId: leadId,
          name: leadToConvert.name || "Converted Lead Deal",
          company: leadToConvert.company || "",
          amount: 0,
          contact: leadToConvert.name || "",
          email: leadToConvert.email || "",
          stage: "qualification",
        };
        const newCustomer = {
          sourceLeadId: leadId,
          name: leadToConvert.name || "",
          company: leadToConvert.company || "",
          email: leadToConvert.email || "",
          phone: leadToConvert.phone || "",
          source: leadToConvert.source || "",
          convertedAt: new Date().toISOString(),
        };

        await Promise.all([
          axios.post("http://localhost:5000/api/deals", newDeal, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.post("http://localhost:5000/api/contacts", newCustomer, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
      }

      fetchLeads();
      fetchStats();
      setSelectedLead(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update lead status");
    }
  };

  const handleAssign = async (leadId, userId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "http://localhost:5000/api/leads/assign",
        { leadId, userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchLeads();
      fetchStats();
      // update selectedLead assignment locally if it's open
      if (selectedLead && selectedLead._id === leadId) {
        setSelectedLead((prev) => ({ ...prev, assignedTo: userId }));
      }
    } catch (err) {
      console.error(err);
      alert("Failed to assign lead");
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

  const getLeadsByStage = (stageId) => {
    return leads.filter((lead) => lead.status === stageId);
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

  const getExportLeads = () => {
    const matchingLeads = search.trim()
      ? leads.filter((lead) =>
          [lead.name, lead.email, lead.company, lead.phone, lead.source, lead.status]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(search.toLowerCase()))
        )
      : leads;

    if (exportView === "all") return matchingLeads;
    return matchingLeads.filter((lead) => lead.status === exportView);
  };

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

          {/* Search and Filter Bar */}
          <div className="leads-toolbar-zoho">
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
            <div className="toolbar-actions">
              <button className="btn-filter" type="button" onClick={handleOpenExportModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export
              </button>
            </div>
          </div>
        </div>

        <div className="leads-scroll-content">
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
                  {getLeadsByStage(stage.id).map((lead) => (
                    <div
                      key={lead._id}
                      className="kanban-card-zoho"
                      onClick={() => handleViewLead(lead)}
                    >
                      <div className="card-top-row">
                        <h4>{lead.name}</h4>
                        <span className={`status-badge-zoho ${lead.status}`}>{lead.status}</span>
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
                    </div>
                  ))}
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
                      <label>First Name *</label>
                      <input
                        type="text"
                        placeholder="Enter first name"
                        value={newLead.firstName}
                        onChange={(e) => setNewLead({ ...newLead, firstName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Last Name *</label>
                      <input
                        type="text"
                        placeholder="Enter last name"
                        value={newLead.lastName}
                        onChange={(e) => setNewLead({ ...newLead, lastName: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Email *</label>
                      <input
                        type="email"
                        placeholder="Enter email address"
                        value={newLead.email}
                        onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Phone</label>
                      <input
                        type="tel"
                        placeholder="Enter phone number"
                        value={newLead.phone}
                        onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="form-section">
                  <h3>Additional Details</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Company</label>
                      <input
                        type="text"
                        placeholder="Enter company name"
                        value={newLead.company}
                        onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Lead Source</label>
                      <select
                        value={newLead.source}
                        onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                      >
                        <option value="">Select source</option>
                        {sources.map((source) => (
                          <option key={source} value={source}>{source}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Status</label>
                      <select
                        value={newLead.status}
                        onChange={(e) => setNewLead({ ...newLead, status: e.target.value })}
                      >
                        {stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>{stage.name}</option>
                        ))}
                      </select>
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
                    Supported headers: `name`, `firstName`, `lastName`, `email`, `phone`, `company`, `source`, `status`, `notes`.
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
              <div className="lead-details-view">
                <div className="detail-row">
                  <span className="detail-label">Company</span>
                  <span className="detail-value">{selectedLead.company || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">{selectedLead.email || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Phone</span>
                  <span className="detail-value">{selectedLead.phone || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Source</span>
                  <span className="detail-value">{selectedLead.source || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className={`status-badge-zoho ${selectedLead.status}`}>{selectedLead.status}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Added On</span>
                  <span className="detail-value">{formatAddedDate(selectedLead.createdAt)}</span>
                </div>
              </div>
              { (isAdmin || isManager) && (
                <div className="assign-section">
                  <h3>Assign To</h3>
                  <select
                    value={selectedLead.assignedTo || ""}
                    onChange={(e) => handleAssign(selectedLead._id, e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {employees.map((emp) => (
                      <option key={emp._id} value={emp._id}>
                        {emp.username} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="status-section">
                <h3>Change Status</h3>
                <div className="status-grid">
                  {stages.map((stage) => (
                    <button 
                      key={stage.id} 
                      className={`status-btn-zoho ${selectedLead.status === stage.id ? 'active' : ''}`}
                      style={{ borderColor: stage.color, color: selectedLead.status === stage.id ? stage.color : '' }}
                      onClick={() => handleUpdateStatus(selectedLead._id, stage.id)}
                    >
                      {stage.name}
                    </button>
                  ))}
                </div>
              </div>
              <RecordActivityPanel
                recordType="Lead"
                recordId={selectedLead._id}
                recordName={selectedLead.name}
              />
              {isAdmin && (
                <button className="delete-btn-zoho" onClick={() => handleDeleteLead(selectedLead._id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Delete Lead
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Leads;


