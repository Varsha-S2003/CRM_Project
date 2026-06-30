const express = require("express");
const axios = require("axios");
const ExcelJS = require("exceljs");
const { verifyToken } = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");

const router = express.Router();

// GET /api/stats/export?format=xlsx&startDate=...&endDate=...
router.get("/export", verifyToken, isAdmin, async (req, res) => {
  try {
    const format = (req.query.format || "xlsx").toLowerCase();
    const { range, startDate, endDate } = req.query;

    // Call internal stats endpoint to reuse aggregation logic.
    const base = `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
    const token = req.get("authorization") || req.get("Authorization");
    const queryParts = [];
    if (range) queryParts.push(`range=${encodeURIComponent(range)}`);
    if (startDate) queryParts.push(`startDate=${encodeURIComponent(startDate)}`);
    if (endDate) queryParts.push(`endDate=${encodeURIComponent(endDate)}`);
    const statsUrl = `${base}/api/stats${queryParts.length ? `?${queryParts.join("&")}` : ""}`;

    const statsRes = await axios.get(statsUrl, {
      headers: token ? { Authorization: token } : undefined,
      timeout: 30000,
    });

    const stats = statsRes.data || {};

    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Elogixa CRM";
      wb.created = new Date();

      const sheet = wb.addWorksheet("Report Summary");
      sheet.columns = [
        { header: "Metric", key: "metric", width: 40 },
        { header: "Value", key: "value", width: 30 },
        { header: "Notes", key: "notes", width: 60 },
      ];

      sheet.addRow(["Exported At", new Date().toISOString(), ""]);
      sheet.addRow([]);

      // Snapshot
      sheet.addRow(["Snapshot"]);
      sheet.addRow(["Revenue closed", stats.totalRevenue || 0, `${stats.conversionRate || 0}% conversion rate`]);
      sheet.addRow(["Pipeline coverage", stats.totalDeals || 0, `${stats.activeLeads || 0} active leads`]);
      sheet.addRow(["Forecast confidence", `${Math.min(99, 60 + Number(stats.conversionRate || 0))}%`, ""]);
      sheet.addRow([]);

      // KPIs
      sheet.addRow(["KPIs"]);
      sheet.addRow(["Monthly Revenue", stats.totalRevenue || 0, `${stats.totalDeals || 0} deals`]);
      sheet.addRow(["Win Rate", `${stats.conversionRate || 0}%`, ""]);
      sheet.addRow(["New Qualified Leads", stats.activeLeads || 0, ""]);
      sheet.addRow(["Avg Sales Cycle", `${Math.max(12, 30 - Number(stats.conversionRate || 0) / 2)} days`, ""]);
      sheet.addRow([]);

      // Pipeline stages
      sheet.addRow(["Pipeline Stages"]);
      const stages = stats.dealsByStage || {};
      Object.keys(stages).forEach((k) => sheet.addRow([k, stages[k], ""]));
      sheet.addRow([]);

      // Top performers
      sheet.addRow(["Top Performers"]);
      const perf = stats.managerPerformance || {};
      Object.keys(perf).forEach((k) => sheet.addRow([k, perf[k], ""]));

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      res.setHeader("Content-Disposition", `attachment; filename="elogixa-reports-${stamp}.xlsx"`);
      await wb.xlsx.write(res);
      res.end();
      return;
    }

    res.status(400).json({ message: "Unsupported export format" });
  } catch (err) {
    console.error("Export error:", err?.message || err);
    res.status(500).json({ message: err?.response?.data?.message || err.message || "Failed to export" });
  }
});

module.exports = router;
