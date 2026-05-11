require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI missing');
  process.exit(1);
}

(async () => {
  try {
    const dns = require('dns');
    if (process.env.MONGO_DNS_SERVERS) {
      const dnsServers = process.env.MONGO_DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean);
      if (dnsServers.length) {
        dns.setServers(dnsServers);
        console.log('Using custom DNS servers for MongoDB lookup:', dnsServers.join(', '));
      }
    }
    await mongoose.connect(uri);
    console.log('Connected to DB');
    const Deal = require('./models/deal');
    const d = await Deal.findOne().sort({ createdAt: -1 }).lean();
    if (!d) {
      console.log('No deals found');
    } else {
      console.log('Found deal id:', d._id);
      console.log('Stage:', d.stage, 'status:', d.status, 'waitingForRestock:', d.waitingForRestock);
    }
    await mongoose.disconnect();
  } catch (e) {
    console.error('DB error', e.message);
    process.exit(1);
  }
})();
