import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import "./Leads.css";

const stages = [
  { id: "qualification", name: "Qualification", color: "#3b82f6" },
  { id: "need_analysis", name: "Need Analysis", color: "#f59e0b" },
  { id: "value_proposition", name: "Value Proposition", color: "#8b5cf6" },
  { id: "identify_decision_maker", name: "Identify Decision Maker", color: "#06b6d4" },
  { id: "proposal_price_quote", name: "Proposal/Price Quote", color: "#ec4899" },
  { id: "negotiate", name: "Negotiate", color: "#6366f1" },
  { id: "won", name: "Won", color: "#10b981" },
  { id: "lost", name: "Lost", color: "#ef4444" },
];

function Deals() {
  const [deals, setDeals] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportView, setExportView] = useState("all");
  const [exportFieldScope, setExportFieldScope] = useState("custom");
  const [exportType, setExportType] = useState("csv");
  const [exportCharset, setExportCharset] = useState("utf-8");
  const createMenuRef = useRef(null);
  const [newDeal, setNewDeal] = useState({
    name: "",
    company: "",
    amount: "",
    contact: "",
    email: "",
    phone: "",
    stage: "qualification",
  });
  const exportViews = [{ id: "all", name: "All Deals" }, ...stages.map((stage) => ({ id: stage.id, name: `${stage.name} Deals` }))];
  const exportFieldPresets = {
    custom: ["name", "company", "amount", "contact", "email", "phone", "stage"],
    basic: ["name", "company", "amount", "stage"],
    all: ["name", "company", "amount", "contact", "email", "phone", "stage", "createdAt"],
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
    { key: "phone", label: "Phone", getValue: (deal) => deal.phone || "-" },
    { key: "stage", label: "Stage", getValue: (deal) => (deal.stage || "-").replaceAll("_", " ") },
    { key: "createdAt", label: "Created On", getValue: (deal) => formatDealDate(deal.createdAt) },
  ];

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/deals", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDeals(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDeals();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target)) {
        setShowCreateMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredDeals = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return deals;
    return deals.filter((deal) =>
      [deal.name, deal.company, deal.contact, deal.email, deal.phone]
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

  // Get stages that have deals matching the search
  const getStagesWithDeals = () => {
    if (!search.trim()) return stages;
    return stages.filter((stage) => getDealsByStage(stage.id).length > 0);
  };

  const openCreateModal = () => {
    setNewDeal({
      name: "",
      company: "",
      amount: "",
      contact: "",
      email: "",
      phone: "",
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
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5000/api/deals",
        { ...newDeal, amount: Number(newDeal.amount) || 0 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDeals((prev) => [res.data, ...prev]);
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
      setDeals((prev) => [...res.data.deals, ...prev]);
      setShowImportModal(false);
      setImportRows([]);
      setImportFileName("");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to import deals from CSV");
    }
  };

  const updateStage = async (dealId, stageId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.put(
        `http://localhost:5000/api/deals/${dealId}`,
        { stage: stageId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDeals((prev) =>
        prev.map((deal) => (deal._id === dealId ? res.data : deal))
      );
      setSelectedDeal((prev) => (prev && prev._id === dealId ? res.data : prev));
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || err.message || "Failed to update deal stage");
    }
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
            <div className="search-box-zoho">
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
            <div className="toolbar-actions">
              <button className="btn-filter" type="button" onClick={openExportModal}>Export</button>
            </div>
          </div>
        </div>

        <div className="leads-scroll-content">
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
                  {getDealsByStage(stage.id).map((deal) => (
                    <div
                      key={deal._id}
                      className="kanban-card-zoho"
                      onClick={() => setSelectedDeal(deal)}
                    >
                      <div className="card-top-row">
                        <h4>{deal.name}</h4>
                        <span className="status-badge-zoho">{deal.stage.replaceAll("_", " ")}</span>
                      </div>
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
            ))}
          </div>
          )}
        </div>

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

        {showModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Create New Deal</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>x</button>
              </div>
              <form onSubmit={submitNewDeal} className="modal-form-zoho">
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Deal Name *</label>
                    <input
                      type="text"
                      name="name"
                      value={newDeal.name}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, name: e.target.value }))}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Company</label>
                    <input
                      type="text"
                      name="company"
                      value={newDeal.company}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, company: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Contact Person</label>
                    <input
                      type="text"
                      name="contact"
                      value={newDeal.contact}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, contact: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={newDeal.email}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, email: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Deal Value</label>
                    <input
                      type="number"
                      name="amount"
                      min="0"
                      value={newDeal.amount}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, amount: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={newDeal.phone}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, phone: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Stage</label>
                    <select
                      value={newDeal.stage}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, stage: e.target.value }))}
                    >
                      {stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
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
                    Supported headers: `name`, `dealName`, `company`, `amount`, `contact`, `email`, `phone`, `stage`.
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
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.slice(0, 5).map((deal, index) => (
                            <tr key={`${deal.name}-${index}`}>
                              <td>{deal.name}</td>
                              <td>{deal.company || "-"}</td>
                              <td>${Number(deal.amount || 0).toLocaleString()}</td>
                              <td>{deal.stage}</td>
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
                <div className="detail-row">
                  <span className="detail-label">Company</span>
                  <span className="detail-value">{selectedDeal.company || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Contact</span>
                  <span className="detail-value">{selectedDeal.contact || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">{selectedDeal.email || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Phone</span>
                  <span className="detail-value">{selectedDeal.phone || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Deal Value</span>
                  <span className="detail-value">${Number(selectedDeal.amount || 0).toLocaleString()}</span>
                </div>
              </div>
              <div className="status-section">
                <h3>Change Stage</h3>
                <div className="status-grid">
                  {stages.map((stage) => (
                    <button
                      key={stage.id}
                      className={`status-btn-zoho ${selectedDeal.stage === stage.id ? "active" : ""}`}
                      style={{ borderColor: stage.color, color: selectedDeal.stage === stage.id ? stage.color : "" }}
                      onClick={() => updateStage(selectedDeal._id, stage.id)}
                    >
                      {stage.name}
                    </button>
                  ))}
                </div>
              </div>
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
