const mongoose = require("mongoose");
require("dotenv").config();

const Deal = require("./models/deal");
const Invoice = require("./models/invoice");
const Payment = require("./models/payment");

const main = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/crm_db";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB\n");

    // Find deals with "Antivirus" in the name
    const deals = await Deal.find({ name: /antivirus/i })
      .populate("product", "name type billingCycle")
      .populate("customerId", "name company email");

    if (deals.length === 0) {
      console.log("❌ No deals found with 'Antivirus' in the name");
      console.log("\n📋 Listing all deals to help you identify:");
      const allDeals = await Deal.find({})
        .select("name product quantity billingCycle stage expiryDate paymentStatus")
        .limit(10);
      console.table(
        allDeals.map((d) => ({
          name: d.name,
          stage: d.stage,
          billingCycle: d.billingCycle || "NOT SET",
          expiryDate: d.expiryDate ? d.expiryDate.toISOString().split("T")[0] : "NOT SET",
          paymentStatus: d.paymentStatus || "NOT SET",
        }))
      );
    } else {
      for (const deal of deals) {
        console.log(`\n✓ Found Deal: ${deal.name}`);
        console.log(`  Customer: ${deal.customerId?.name || "Unknown"} (${deal.customerId?.company || ""})`);
        console.log(`  Product: ${deal.product?.name || "Unknown"}`);
        console.log(`  Stage: ${deal.stage}`);
        console.log(`  Billing Cycle: ${deal.billingCycle || "❌ NOT SET"}`);
        console.log(`  Start Date: ${deal.startDate ? deal.startDate.toISOString().split("T")[0] : "NOT SET"}`);
        console.log(`  Expiry Date: ${deal.expiryDate ? deal.expiryDate.toISOString().split("T")[0] : "❌ NOT SET"}`);
        console.log(`  Next Billing: ${deal.nextBillingDate ? deal.nextBillingDate.toISOString().split("T")[0] : "NOT SET"}`);
        console.log(`  Payment Status: ${deal.paymentStatus || "❌ NOT SET"}`);
        console.log(`  Quantity/Reserved: ${deal.quantity}/${deal.reservedQuantity || 0}`);

        // Check for invoice
        const invoice = await Invoice.findOne({ dealId: deal._id });
        if (invoice) {
          console.log(`\n  📄 Invoice Found:`);
          console.log(`    Invoice #: ${invoice.invoiceNumber}`);
          console.log(`    Status: ${invoice.status}`);
          console.log(`    Amount: ${invoice.totalAmount}`);
          console.log(`    Issue Date: ${invoice.issueDate.toISOString().split("T")[0]}`);
          console.log(`    Due Date: ${invoice.dueDate.toISOString().split("T")[0]}`);

          // Check for payment
          const payment = await Payment.findOne({
            paymentSource: "CLIENT_INVOICE",
            invoiceId: invoice._id,
          });
          if (payment) {
            console.log(`\n  💳 Payment Found:`);
            console.log(`    Amount: ${payment.amount}`);
            console.log(`    Mode: ${payment.paymentMode}`);
            console.log(`    Date: ${payment.paymentDate.toISOString().split("T")[0]}`);
            console.log(`    Transaction ID: ${payment.transactionId}`);
            console.log(`    ✓ Payment completed successfully`);
          } else {
            console.log(`\n  ❌ No payment found for this invoice`);
          }
        } else {
          console.log(`\n  ❌ No invoice found for this deal`);
        }
      }
    }

    await mongoose.connection.close();
    console.log("\n✓ Connection closed");
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
};

main();
