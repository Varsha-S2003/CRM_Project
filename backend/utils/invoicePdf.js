const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN");
};

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return `Rs.${safe.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const escapePdfText = (value) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const generateInvoicePdfBuffer = async (invoice) => {
  return new Promise((resolve) => {
    const stream = buildProfessionalPdf(invoice || {});
    resolve(stream);
  });
};

const buildProfessionalPdf = (invoice) => {
  const commands = [];

  // ===== HEADER SECTION =====
  // Green header bar
  commands.push("q");
  commands.push("0.12 0.48 0.28 rg");
  commands.push("0 750 595 92 re");
  commands.push("f");
  commands.push("Q");

  // Company name - large and white
  commands.push("BT");
  commands.push("/F1-Bold 28 Tf");
  commands.push("1 1 1 rg");
  commands.push("50 805 Td");
  commands.push("(ELOGIXA CRM) Tj");
  commands.push("ET");

  // Company tagline - white text, smaller
  commands.push("BT");
  commands.push("/F1 10 Tf");
  commands.push("1 1 1 rg");
  commands.push("50 787 Td");
  commands.push("(Professional Invoice Management) Tj");
  commands.push("ET");

  // INVOICE title - right side, large
  commands.push("BT");
  commands.push("/F1-Bold 32 Tf");
  commands.push("1 1 1 rg");
  commands.push("400 805 Td");
  commands.push("(INVOICE) Tj");
  commands.push("ET");

  // Invoice metadata block with wider spacing
  commands.push("BT");
  commands.push("/F1-Bold 10 Tf");
  commands.push("0.38 0.5 0.34 rg");
  commands.push("45 720 Td");
  commands.push("(Invoice #:) Tj");
  commands.push("165 0 Td");
  commands.push("(Issue Date:) Tj");
  commands.push("140 0 Td");
  commands.push("(Due Date:) Tj");
  commands.push("130 0 Td");
  commands.push("(Status:) Tj");
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 11 Tf");
  commands.push("0 0 0 rg");
  commands.push("45 702 Td");
  commands.push(`(${escapePdfText(String(invoice?.invoiceNumber || "-").slice(0, 20))}) Tj`);
  commands.push("165 0 Td");
  commands.push(`(${escapePdfText(formatDate(invoice?.issueDate))}) Tj`);
  commands.push("140 0 Td");
  commands.push(`(${escapePdfText(formatDate(invoice?.dueDate))}) Tj`);
  commands.push("130 0 Td");
  commands.push(`(${escapePdfText(String(invoice?.status || "Draft").slice(0, 16))}) Tj`);
  commands.push("ET");

  // Horizontal divider
  commands.push("q");
  commands.push("0.83 0.88 0.81 RG");
  commands.push("1.5 w");
  commands.push("45 692 m");
  commands.push("555 692 l");
  commands.push("S");
  commands.push("Q");

  // ===== BILL TO AND SHIP TO SECTIONS =====
  // Bill To
  commands.push("BT");
  commands.push("/F1-Bold 11 Tf");
  commands.push("0.38 0.5 0.34 rg");
  commands.push("50 675 Td");
  commands.push("(BILL TO) Tj");
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 9 Tf");
  commands.push("0 0 0 rg");
  commands.push("50 660 Td");
  commands.push(`(${escapePdfText(String(invoice?.customerName || "-").slice(0, 45))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(${escapePdfText(String(invoice?.company || "-").slice(0, 45))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(${escapePdfText(String(invoice?.email || "-").slice(0, 50))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(${escapePdfText(String(invoice?.phone || "-").slice(0, 25))}) Tj`);
  commands.push("ET");

  // Ship To
  commands.push("BT");
  commands.push("/F1-Bold 11 Tf");
  commands.push("0.38 0.5 0.34 rg");
  commands.push("350 675 Td");
  commands.push("(SHIP TO) Tj");
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 9 Tf");
  commands.push("0 0 0 rg");
  commands.push("350 660 Td");
  commands.push(`(${escapePdfText(String(invoice?.customerName || "-").slice(0, 45))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(${escapePdfText(String(invoice?.company || "-").slice(0, 45))}) Tj`);
  commands.push("0 -12 Td");
  commands.push("(Same as billing address) Tj");
  commands.push("ET");

  // ===== LINE ITEMS TABLE =====
  // Table header with green background
  commands.push("q");
  commands.push("0.12 0.48 0.28 rg");
  commands.push("50 605 495 22 re");
  commands.push("f");
  commands.push("Q");

  commands.push("BT");
  commands.push("/F1-Bold 9 Tf");
  commands.push("1 1 1 rg");
  commands.push("60 613 Td");
  commands.push("(#) Tj");
  commands.push("90 0 Td");
  commands.push("(Item & Description) Tj");
  commands.push("200 0 Td");
  commands.push("(Qty) Tj");
  commands.push("40 0 Td");
  commands.push("(Rate) Tj");
  commands.push("70 0 Td");
  commands.push("(Amount) Tj");
  commands.push("ET");

  // Draw table border
  commands.push("q");
  commands.push("0.2 w");
  commands.push("0.38 0.5 0.34 RG");
  commands.push("50 605 m");
  commands.push("545 605 l");
  commands.push("S");
  commands.push("Q");

  // Line items rows
  const lineItems = Array.isArray(invoice?.lineItems) ? invoice.lineItems : [];
  let yPos = 590;
  let rowNum = 1;

  lineItems.slice(0, 10).forEach((item) => {
    // Alternating row background
    if (rowNum % 2 === 0) {
      commands.push("q");
      commands.push("0.97 0.98 0.96 rg");
      commands.push(`50 ${yPos - 18} 495 18 re`);
      commands.push("f");
      commands.push("Q");
    }

    // Row border
    commands.push("q");
    commands.push("0.83 0.88 0.81 RG");
    commands.push("0.5 w");
    commands.push(`50 ${yPos - 18} m`);
    commands.push(`545 ${yPos - 18} l`);
    commands.push("S");
    commands.push("Q");

    commands.push("BT");
    commands.push("/F1 8 Tf");
    commands.push("0 0 0 rg");
    commands.push(`58 ${yPos - 10} Td`);
    commands.push(`(${rowNum}) Tj`);
    commands.push(`150 0 Td`);
    commands.push(`(${escapePdfText(String(item?.product || "-").slice(0, 26))}) Tj`);
    commands.push(`200 0 Td`);
    commands.push(`(${Number(item?.quantity || 0)}) Tj`);
    commands.push(`40 0 Td`);
    commands.push(`(${escapePdfText(formatCurrency(item?.unitPrice || 0))}) Tj`);
    commands.push(`70 0 Td`);
    commands.push(`(${escapePdfText(formatCurrency(item?.totalAmount || 0))}) Tj`);
    commands.push("ET");

    yPos -= 20;
    rowNum += 1;
  });

  // Final table border
  commands.push("q");
  commands.push("0.2 w");
  commands.push("0.38 0.5 0.34 RG");
  commands.push(`50 ${yPos} m`);
  commands.push(`545 ${yPos} l`);
  commands.push("S");
  commands.push("Q");

  // ===== TOTALS SECTION =====
  yPos -= 18;

  // Subtotal
  commands.push("BT");
  commands.push("/F1 9 Tf");
  commands.push("0 0 0 rg");
  commands.push(`350 ${yPos} Td`);
  commands.push("(Sub Total) Tj");
  commands.push("150 0 Td");
  commands.push(`(${escapePdfText(formatCurrency(invoice?.subtotal || 0))}) Tj`);
  commands.push("ET");

  yPos -= 16;

  // Discount
  commands.push("BT");
  commands.push("/F1 9 Tf");
  commands.push(`350 ${yPos} Td`);
  commands.push(`(Discount (${Number(invoice?.discountPercent || 0).toFixed(1)}%)) Tj`);
  commands.push("150 0 Td");
  commands.push(`(${escapePdfText(formatCurrency(invoice?.discountValue || 0))}) Tj`);
  commands.push("ET");

  yPos -= 16;

  // Tax Rate
  commands.push("BT");
  commands.push("/F1 9 Tf");
  commands.push(`350 ${yPos} Td`);
  commands.push("(Tax Rate) Tj");
  commands.push("150 0 Td");
  const taxRate = invoice?.subtotal > 0 
    ? ((invoice?.gstAmount / (invoice?.subtotal - (invoice?.discountValue || 0))) * 100).toFixed(2)
    : "0.00";
  commands.push(`(${taxRate}%) Tj`);
  commands.push("ET");

  yPos -= 18;

  // Divider line
  commands.push("q");
  commands.push("0.83 0.88 0.81 RG");
  commands.push("1 w");
  commands.push(`300 ${yPos} m`);
  commands.push(`545 ${yPos} l`);
  commands.push("S");
  commands.push("Q");

  yPos -= 16;

  // Grand Total box with gold accent border
  commands.push("q");
  commands.push("0.96 0.96 0.94 rg");
  commands.push(`280 ${yPos - 28} 265 32 re`);
  commands.push("f");
  commands.push("Q");

  commands.push("q");
  commands.push("0.96 0.74 0 RG");
  commands.push("2 w");
  commands.push(`280 ${yPos - 28} 265 32 re`);
  commands.push("S");
  commands.push("Q");

  commands.push("BT");
  commands.push("/F1-Bold 11 Tf");
  commands.push("0.38 0.5 0.34 rg");
  commands.push(`320 ${yPos - 12} Td`);
  commands.push("(TOTAL) Tj");
  commands.push("100 0 Td");
  commands.push(`(${escapePdfText(formatCurrency(invoice?.totalAmount || 0))}) Tj`);
  commands.push("ET");

  yPos -= 36;

  // Tax Amount
  commands.push("BT");
  commands.push("/F1 8 Tf");
  commands.push("0.3 0.3 0.3 rg");
  commands.push(`350 ${yPos} Td`);
  commands.push("(Total Tax Amount) Tj");
  commands.push("150 0 Td");
  commands.push(`(${escapePdfText(formatCurrency(invoice?.gstAmount || 0))}) Tj`);
  commands.push("ET");

  yPos -= 14;

  // Balance Due
  commands.push("BT");
  commands.push("/F1-Bold 9 Tf");
  commands.push("0.12 0.48 0.28 rg");
  commands.push(`350 ${yPos} Td`);
  commands.push("(Balance Due) Tj");
  commands.push("150 0 Td");
  commands.push(`(${escapePdfText(formatCurrency(invoice?.totalAmount || 0))}) Tj`);
  commands.push("ET");

  // ===== FOOTER SECTION =====
  yPos = 90;

  commands.push("q");
  commands.push("0.83 0.88 0.81 RG");
  commands.push("1 w");
  commands.push("50 100 m");
  commands.push("545 100 l");
  commands.push("S");
  commands.push("Q");

  commands.push("BT");
  commands.push("/F1-Bold 9 Tf");
  commands.push("0.38 0.5 0.34 rg");
  commands.push(`50 ${yPos} Td`);
  commands.push("(Terms & Conditions) Tj");
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 8 Tf");
  commands.push("0.3 0.3 0.3 rg");
  commands.push(`50 ${yPos - 12} Td`);
  const termsText = String(invoice?.terms || "Thank you for your business.").slice(0, 85);
  commands.push(`(${escapePdfText(termsText)}) Tj`);
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 7 Tf");
  commands.push("0.6 0.6 0.6 rg");
  commands.push("50 20 Td");
  commands.push("(Generated by ELOGIXA CRM) Tj");
  commands.push("ET");

  const streamContent = commands.join("\n");

  const fontDict =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const fontBoldDict =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  const pageObject =
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F1-Bold 5 0 R >> >> /Contents 6 0 R >>`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    pageObject,
    fontDict,
    fontBoldDict,
    `<< /Length ${Buffer.byteLength(streamContent, "utf8")} >>\nstream\n${streamContent}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((obj, idx) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${idx + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
};

module.exports = {
  generateInvoicePdfBuffer,
};
