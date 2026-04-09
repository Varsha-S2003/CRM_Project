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
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");

const buildProposalPdf = (payload) => {
  const proposal = payload || {};
  const commands = [];

  const lineItems = Array.isArray(proposal.lineItems) ? proposal.lineItems : [];
  const proposalNumber = String(proposal.proposalNumber || "PROPOSAL").trim() || "PROPOSAL";

  // Header
  commands.push("q");
  commands.push("0.12 0.48 0.28 rg");
  commands.push("0 760 595 82 re");
  commands.push("f");
  commands.push("Q");

  commands.push("BT");
  commands.push("/F1-Bold 24 Tf");
  commands.push("1 1 1 rg");
  commands.push("45 804 Td");
  commands.push("(ELOGIXA CRM) Tj");
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1-Bold 22 Tf");
  commands.push("1 1 1 rg");
  commands.push("410 804 Td");
  commands.push("(PROPOSAL) Tj");
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 10 Tf");
  commands.push("0.38 0.5 0.34 rg");
  commands.push("45 738 Td");
  commands.push("(Proposal #:) Tj");
  commands.push("115 0 Td");
  commands.push(`(${escapePdfText(proposalNumber.slice(0, 28))}) Tj`);
  commands.push("145 0 Td");
  commands.push("(Issue Date:) Tj");
  commands.push("78 0 Td");
  commands.push(`(${escapePdfText(formatDate(proposal.issueDate))}) Tj`);
  commands.push("ET");

  commands.push("q");
  commands.push("0.83 0.88 0.81 RG");
  commands.push("1.2 w");
  commands.push("45 728 m");
  commands.push("555 728 l");
  commands.push("S");
  commands.push("Q");

  // Client block
  commands.push("BT");
  commands.push("/F1-Bold 11 Tf");
  commands.push("0.38 0.5 0.34 rg");
  commands.push("45 706 Td");
  commands.push("(CLIENT DETAILS) Tj");
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 9 Tf");
  commands.push("0 0 0 rg");
  commands.push("45 690 Td");
  commands.push(`(Name: ${escapePdfText(String(proposal.contactName || "-").slice(0, 44))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(Company: ${escapePdfText(String(proposal.company || "-").slice(0, 44))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(Email: ${escapePdfText(String(proposal.email || "-").slice(0, 52))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(Phone: ${escapePdfText(String(proposal.phone || "-").slice(0, 26))}) Tj`);
  commands.push("ET");

  // Summary block
  commands.push("BT");
  commands.push("/F1-Bold 11 Tf");
  commands.push("0.38 0.5 0.34 rg");
  commands.push("320 706 Td");
  commands.push("(SUMMARY) Tj");
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 9 Tf");
  commands.push("0 0 0 rg");
  commands.push("320 690 Td");
  commands.push(`(Deal: ${escapePdfText(String(proposal.dealName || "-").slice(0, 30))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(Subject: ${escapePdfText(String(proposal.subject || "Proposal").slice(0, 30))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(Estimated Price: ${escapePdfText(formatCurrency(proposal.totalAmount || 0))}) Tj`);
  commands.push("0 -12 Td");
  commands.push(`(Status: ${escapePdfText(String(proposal.status || "Sent").slice(0, 22))}) Tj`);
  commands.push("ET");

  let y = 616;

  const writeSection = (title, content) => {
    commands.push("BT");
    commands.push("/F1-Bold 10 Tf");
    commands.push("0.38 0.5 0.34 rg");
    commands.push(`45 ${y} Td`);
    commands.push(`(${escapePdfText(title)}) Tj`);
    commands.push("ET");

    y -= 14;

    commands.push("BT");
    commands.push("/F1 8 Tf");
    commands.push("0 0 0 rg");
    commands.push(`45 ${y} Td`);
    commands.push(`(${escapePdfText(String(content || "-").slice(0, 110))}) Tj`);
    commands.push("ET");

    y -= 20;
  };

  writeSection("Introduction", proposal.introduction);
  writeSection("Problem", proposal.problem);
  writeSection("Solution", proposal.solution);

  // Line items table
  commands.push("q");
  commands.push("0.12 0.48 0.28 rg");
  commands.push(`45 ${y} 510 20 re`);
  commands.push("f");
  commands.push("Q");

  commands.push("BT");
  commands.push("/F1-Bold 8 Tf");
  commands.push("1 1 1 rg");
  commands.push(`52 ${y + 7} Td`);
  commands.push("(Item) Tj");
  commands.push("225 0 Td");
  commands.push("(Qty) Tj");
  commands.push("50 0 Td");
  commands.push("(Rate) Tj");
  commands.push("70 0 Td");
  commands.push("(GST) Tj");
  commands.push("60 0 Td");
  commands.push("(Total) Tj");
  commands.push("ET");

  y -= 18;

  lineItems.slice(0, 6).forEach((item, index) => {
    if (index % 2 === 1) {
      commands.push("q");
      commands.push("0.97 0.98 0.96 rg");
      commands.push(`45 ${y - 12} 510 16 re`);
      commands.push("f");
      commands.push("Q");
    }

    commands.push("BT");
    commands.push("/F1 8 Tf");
    commands.push("0 0 0 rg");
    commands.push(`52 ${y - 6} Td`);
    commands.push(`(${escapePdfText(String(item.productName || item.product || "-").slice(0, 36))}) Tj`);
    commands.push("225 0 Td");
    commands.push(`(${Number(item.quantity || 0)}) Tj`);
    commands.push("50 0 Td");
    commands.push(`(${escapePdfText(formatCurrency(item.price || item.unitPrice || 0))}) Tj`);
    commands.push("70 0 Td");
    commands.push(`(${Number(item.gstPercent || 0).toFixed(2)}%) Tj`);
    commands.push("60 0 Td");
    commands.push(`(${escapePdfText(formatCurrency(item.totalAmount || 0))}) Tj`);
    commands.push("ET");

    y -= 18;
  });

  y -= 8;

  commands.push("BT");
  commands.push("/F1-Bold 10 Tf");
  commands.push("0.38 0.5 0.34 rg");
  commands.push(`340 ${y} Td`);
  commands.push("(Grand Total) Tj");
  commands.push("90 0 Td");
  commands.push(`(${escapePdfText(formatCurrency(proposal.totalAmount || 0))}) Tj`);
  commands.push("ET");

  y -= 20;

  commands.push("BT");
  commands.push("/F1 8 Tf");
  commands.push("0.25 0.25 0.25 rg");
  commands.push(`45 ${y} Td`);
  commands.push("(This is the estimated price and further discussion on this will be done in nxt meeting.) Tj");
  commands.push("ET");

  y -= 14;

  commands.push("BT");
  commands.push("/F1 8 Tf");
  commands.push("0.35 0.35 0.35 rg");
  commands.push(`45 ${y} Td`);
  commands.push(`(Terms: ${escapePdfText(String(proposal.terms || "Standard commercial terms apply.").slice(0, 98))}) Tj`);
  commands.push("ET");

  commands.push("BT");
  commands.push("/F1 7 Tf");
  commands.push("0.6 0.6 0.6 rg");
  commands.push("45 24 Td");
  commands.push("(Generated by ELOGIXA CRM) Tj");
  commands.push("ET");

  const streamContent = commands.join("\n");

  const fontDict = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const fontBoldDict = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F1-Bold 5 0 R >> >> /Contents 6 0 R >>",
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

const generateProposalPdfBuffer = async (payload) => {
  return new Promise((resolve) => {
    resolve(buildProposalPdf(payload || {}));
  });
};

module.exports = {
  generateProposalPdfBuffer,
};
