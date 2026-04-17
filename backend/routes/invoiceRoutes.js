const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const os = require("os");
const { verifyToken } = require("../middleware/authMiddleware");
const Deal = require("../models/deal");
const Invoice = require("../models/invoice");
const Item = require("../models/item");
const Payment = require("../models/payment");
const InvoicePaymentToken = require("../models/invoicePaymentToken");
const { generateInvoicePdfBuffer } = require("../utils/invoicePdf");
const { sendInvoiceEmailToClient } = require("../utils/mailer");

const router = express.Router();

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const nextDueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 15);
  return date;
};

const buildInvoiceNumber = () => {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `INV-${stamp}-${suffix}`;
};

const normalizeBaseUrl = (raw) => String(raw || "").trim().replace(/\/+$/, "");

const getLocalNetworkIp = () => {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!Array.isArray(iface)) continue;
    for (const addr of iface) {
      if (addr && addr.family === "IPv4" && !addr.internal && addr.address) {
        return addr.address;
      }
    }
  }
  return "";
};

const getClientBaseUrl = (req) => {
  const configured = normalizeBaseUrl(
    process.env.CLIENT_APP_URL ||
      process.env.FRONTEND_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.PUBLIC_WEB_URL
  );

  if (configured) {
    try {
      const parsed = new URL(configured);
      const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname);
      if (isLocalHost) {
        const frontendPort = String(process.env.CLIENT_APP_PORT || parsed.port || "3000");
        const lanIp = getLocalNetworkIp();
        if (lanIp) {
          return `${parsed.protocol}//${lanIp}:${frontendPort}`;
        }
      }
      return configured;
    } catch (_err) {
      return configured;
    }
  }

  const origin = normalizeBaseUrl(req?.get?.("origin"));
  if (/^https?:\/\//i.test(origin)) return origin;

  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req?.protocol || "http";
  const forwardedHost = String(req?.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || req?.get?.("host") || "";

  if (host) {
    const backendPort = String(process.env.PORT || "5000");
    const frontendPort = String(process.env.CLIENT_APP_PORT || "3000");
    let adjustedHost = host.endsWith(`:${backendPort}`)
      ? `${host.slice(0, -backendPort.length)}${frontendPort}`
      : host;

    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(adjustedHost)) {
      const lanIp = getLocalNetworkIp();
      if (lanIp) {
        adjustedHost = `${lanIp}:${frontendPort}`;
      }
    }

    return `${protocol}://${adjustedHost}`;
  }

  const lanIp = getLocalNetworkIp();
  if (lanIp) {
    return `http://${lanIp}:${String(process.env.CLIENT_APP_PORT || "3000")}`;
  }

  return "http://localhost:3000";
};

const buildPaymentUrl = (token, req) => `${getClientBaseUrl(req)}/pay-invoice?token=${encodeURIComponent(token)}`;

const getTokenExpiryDate = () => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  return expiry;
};

const generateTokenValue = () => crypto.randomBytes(32).toString("hex");

const generateTransactionId = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const seed = Date.now().toString().slice(-8);
    const randomPart = crypto.randomInt(100000, 999999).toString();
    const transactionId = `${seed}${randomPart}`;
    // Ensure transaction ID uniqueness across both token and payment stores.
    const [inToken, inPayments] = await Promise.all([
      InvoicePaymentToken.exists({ transactionId }),
      Payment.exists({ transactionId }),
    ]);
    if (!inToken && !inPayments) return transactionId;
  }

  return `${Date.now()}${crypto.randomInt(100000, 999999)}`;
};

const createInvoicePaymentToken = async (invoice) => {
  await InvoicePaymentToken.updateMany(
    { invoiceId: invoice._id, status: "unpaid" },
    { $set: { status: "expired", expiresAt: new Date() } }
  );

  const amount = roundMoney(invoice?.totalAmount || 0);
  const token = generateTokenValue();
  const transactionId = await generateTransactionId();

  const tokenDoc = await InvoicePaymentToken.create({
    token,
    transactionId,
    invoiceId: invoice._id,
    amount,
    status: "unpaid",
    expiresAt: getTokenExpiryDate(),
  });

  return tokenDoc;
};

router.get("/pay/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) {
      return res.status(400).json({ message: "Invalid payment token." });
    }

    const tokenDoc = await InvoicePaymentToken.findOne({ token })
      .populate("invoiceId", "invoiceNumber customerName company dueDate totalAmount status currency")
      .populate("paymentId", "amount paymentMode paymentDate transactionId")
      .lean();

    if (!tokenDoc) {
      return res.status(404).json({ message: "Payment link is invalid." });
    }

    const isExpired = tokenDoc.expiresAt && new Date(tokenDoc.expiresAt) < new Date();
    const normalizedStatus = isExpired && tokenDoc.status === "unpaid" ? "expired" : tokenDoc.status;

    if (normalizedStatus === "expired") {
      return res.status(410).json({
        message: "Payment link has expired.",
        status: "expired",
        transactionId: tokenDoc.transactionId,
      });
    }

    return res.json({
      token: tokenDoc.token,
      status: normalizedStatus,
      transactionId: tokenDoc.transactionId,
      amount: tokenDoc.amount,
      invoice: tokenDoc.invoiceId || null,
      payment: tokenDoc.paymentId || null,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to fetch payment details" });
  }
});

router.post("/pay/:token/complete", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) {
      return res.status(400).json({ message: "Invalid payment token." });
    }

    const tokenDoc = await InvoicePaymentToken.findOne({ token });
    if (!tokenDoc) {
      return res.status(404).json({ message: "Payment link is invalid." });
    }

    if (tokenDoc.expiresAt && tokenDoc.expiresAt < new Date() && tokenDoc.status === "unpaid") {
      tokenDoc.status = "expired";
      await tokenDoc.save();
      return res.status(410).json({ message: "Payment link has expired.", status: "expired" });
    }

    if (tokenDoc.status === "paid") {
      const existingPayment = tokenDoc.paymentId ? await Payment.findById(tokenDoc.paymentId).lean() : null;
      return res.json({
        message: "Payment already completed.",
        status: "paid",
        transactionId: tokenDoc.transactionId,
        payment: existingPayment,
      });
    }

    const invoice = await Invoice.findById(tokenDoc.invoiceId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found for this payment link." });
    }

    const existingInvoicePayment = await Payment.findOne({
      paymentSource: "CLIENT_INVOICE",
      invoiceId: invoice._id,
    });

    if (existingInvoicePayment) {
      invoice.status = "Paid";
      await invoice.save();

      tokenDoc.status = "paid";
      tokenDoc.paidAt = tokenDoc.paidAt || new Date();
      tokenDoc.paymentId = existingInvoicePayment._id;
      await tokenDoc.save();

      return res.json({
        message: "Payment already exists for this invoice.",
        status: "paid",
        transactionId: existingInvoicePayment.transactionId || tokenDoc.transactionId,
        payment: existingInvoicePayment,
        invoiceStatus: invoice.status,
      });
    }

    const paymentMode = ["UPI", "Bank", "Cash"].includes(String(req.body?.paymentMode || ""))
      ? String(req.body.paymentMode)
      : "UPI";

    let payment = await Payment.findOne({ transactionId: tokenDoc.transactionId });
    if (!payment) {
      try {
        payment = await Payment.create({
          paymentSource: "CLIENT_INVOICE",
          invoiceId: invoice._id,
          amount: tokenDoc.amount,
          paymentMode,
          paymentDate: new Date(),
          transactionId: tokenDoc.transactionId,
        });
      } catch (createErr) {
        if (createErr?.code === 11000) {
          payment = await Payment.findOne({
            paymentSource: "CLIENT_INVOICE",
            invoiceId: invoice._id,
          });
        } else {
          throw createErr;
        }
      }
    }

    invoice.status = "Paid";
    await invoice.save();

    tokenDoc.status = "paid";
    tokenDoc.paidAt = new Date();
    tokenDoc.paymentId = payment._id;
    await tokenDoc.save();

    return res.json({
      message: "Payment completed successfully.",
      status: "paid",
      transactionId: tokenDoc.transactionId,
      payment,
      invoiceStatus: invoice.status,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to complete payment" });
  }
});

const getDealInvoiceBreakdown = async (deal) => {
  const quantity = Math.max(1, Number(deal?.quantity || 1));
  let unitPrice = Number(deal?.product?.price ?? deal?.product?.cost ?? 0);

  if (!unitPrice && Number(deal?.amount || 0) > 0) {
    unitPrice = Number(deal.amount) / quantity;
  }

  if (!unitPrice && deal?.product?._id && mongoose.isValidObjectId(deal.product._id)) {
    const freshItem = await Item.findById(deal.product._id).select("price cost gst_percent name").lean();
    if (freshItem) {
      unitPrice = Number(freshItem.price ?? freshItem.cost ?? 0);
      deal.product.name = deal.product.name || freshItem.name || deal.product.name;
      deal.product.gst_percent = freshItem.gst_percent ?? deal.product.gst_percent;
    }
  }

  unitPrice = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
  const taxableAmount = roundMoney(unitPrice * quantity);
  const gstPercent = Math.max(0, Number(deal?.product?.gst_percent || 0));
  const gstBeforeDiscount = roundMoney((taxableAmount * gstPercent) / 100);
  const grossBeforeDiscount = roundMoney(taxableAmount + gstBeforeDiscount);
  const discountPercent = Math.min(100, Math.max(0, Number(deal?.proposalDraft?.discountPercent || 0)));
  const discountValue = roundMoney((taxableAmount * discountPercent) / 100);
  const discountedTaxable = roundMoney(Math.max(0, taxableAmount - discountValue));
  const gstAmount = roundMoney((discountedTaxable * gstPercent) / 100);
  const totalAmount = roundMoney(discountedTaxable + gstAmount);

  return {
    quantity,
    unitPrice,
    gstPercent,
    taxableAmount,
    gstBeforeDiscount,
    grossBeforeDiscount,
    discountPercent,
    discountValue,
    discountedTaxable,
    gstAmount,
    totalAmount,
  };
};

router.get("/", verifyToken, async (req, res) => {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    const filter = {};

    if (role === "EMPLOYEE") {
      filter.$or = [{ createdBy: req.user._id }, { assignedTo: req.user._id }];
    }

    const invoices = await Invoice.find(filter)
      .populate("dealId", "name company stage")
      .sort({ createdAt: -1 })
      .lean();

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to fetch invoices" });
  }
});

router.post("/from-quotation/:dealId", verifyToken, async (req, res) => {
  try {
    const { dealId } = req.params;
    if (!mongoose.isValidObjectId(dealId)) {
      return res.status(400).json({ message: "Invalid deal id" });
    }

    const deal = await Deal.findById(dealId)
      .populate("product", "name price cost gst_percent")
      .populate("assignedTo", "_id name username")
      .lean();

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    if (!deal?.proposalDraft?.savedToQuotationAt) {
      return res.status(400).json({ message: "Save quotation before converting to invoice." });
    }

    const breakdown = await getDealInvoiceBreakdown(deal);
    if (breakdown.totalAmount <= 0) {
      return res.status(400).json({ message: "Cannot generate invoice with zero total amount." });
    }

    const lineItem = {
      product: String(deal?.product?.name || deal?.name || "Product").trim(),
      quantity: breakdown.quantity,
      unitPrice: breakdown.unitPrice,
      gstPercent: breakdown.gstPercent,
      taxableAmount: breakdown.taxableAmount,
      totalAmount: breakdown.grossBeforeDiscount,
    };

    let invoice = await Invoice.findOne({ dealId });
    if (!invoice) {
      invoice = new Invoice({
        invoiceNumber: buildInvoiceNumber(),
        dealId,
        assignedTo: deal?.assignedTo?._id || null,
        customerName: String(deal?.contact || "").trim(),
        company: String(deal?.company || "").trim(),
        email: String(deal?.email || "").trim(),
        phone: String(deal?.phone || "").trim(),
        issueDate: new Date(),
        dueDate: nextDueDate(),
        currency: "INR",
        subtotal: breakdown.taxableAmount,
        discountPercent: breakdown.discountPercent,
        discountValue: breakdown.discountValue,
        gstAmount: breakdown.gstAmount,
        totalAmount: breakdown.totalAmount,
        status: "Draft",
        lineItems: [lineItem],
        notes: String(deal?.proposalDraft?.pricingNotes || "").trim(),
        terms: String(deal?.proposalDraft?.terms || "").trim(),
        createdBy: req.user._id,
      });
    } else {
      invoice.assignedTo = deal?.assignedTo?._id || invoice.assignedTo;
      invoice.customerName = String(deal?.contact || invoice.customerName || "").trim();
      invoice.company = String(deal?.company || invoice.company || "").trim();
      invoice.email = String(deal?.email || invoice.email || "").trim();
      invoice.phone = String(deal?.phone || invoice.phone || "").trim();
      invoice.issueDate = new Date();
      invoice.dueDate = nextDueDate();
      invoice.subtotal = breakdown.taxableAmount;
      invoice.discountPercent = breakdown.discountPercent;
      invoice.discountValue = breakdown.discountValue;
      invoice.gstAmount = breakdown.gstAmount;
      invoice.totalAmount = breakdown.totalAmount;
      invoice.lineItems = [lineItem];
      invoice.notes = String(deal?.proposalDraft?.pricingNotes || invoice.notes || "").trim();
      invoice.terms = String(deal?.proposalDraft?.terms || invoice.terms || "").trim();
    }

    await invoice.save();

    res.status(201).json({
      message: "Invoice created from quotation.",
      invoice,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ message: "Invoice number conflict. Try again." });
    }
    res.status(500).json({ message: err.message || "Failed to create invoice" });
  }
});

router.get("/:id/pdf", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid invoice id" });
    }

    const invoice = await Invoice.findById(id).lean();
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const role = String(req.user?.role || "").toUpperCase();
    if (
      role === "EMPLOYEE" &&
      String(invoice.createdBy || "") !== String(req.user._id || "") &&
      String(invoice.assignedTo || "") !== String(req.user._id || "")
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const pdfBuffer = await generateInvoicePdfBuffer(invoice);
    const fileName = `${String(invoice.invoiceNumber || "invoice").replace(/[^a-zA-Z0-9-_]/g, "_")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to generate invoice PDF" });
  }
});

router.post("/:id/send-client", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid invoice id" });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const role = String(req.user?.role || "").toUpperCase();
    if (
      role === "EMPLOYEE" &&
      String(invoice.createdBy || "") !== String(req.user._id || "") &&
      String(invoice.assignedTo || "") !== String(req.user._id || "")
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const toEmail = String(invoice.email || "").trim();
    if (!toEmail) {
      return res.status(400).json({ message: "Client email is missing on invoice." });
    }

    const tokenDoc = await createInvoicePaymentToken(invoice);
    const paymentUrl = buildPaymentUrl(tokenDoc.token, req);
    const pdfBuffer = await generateInvoicePdfBuffer({
      ...invoice.toObject(),
      paymentUrl,
      paymentTransactionId: tokenDoc.transactionId,
    });
    const { preview } = await sendInvoiceEmailToClient({
      to: toEmail,
      customerName: invoice.customerName,
      company: invoice.company,
      invoice,
      pdfBuffer,
      paymentUrl,
      transactionId: tokenDoc.transactionId,
    });

    invoice.status = invoice.status === "Paid" ? "Paid" : "Sent";
    await invoice.save();

    return res.json({
      message: "Invoice sent to client successfully.",
      status: invoice.status,
      transactionId: tokenDoc.transactionId,
      paymentUrl,
      preview: preview || null,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to send invoice email" });
  }
});

module.exports = router;
