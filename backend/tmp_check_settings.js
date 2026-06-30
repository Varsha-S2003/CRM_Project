require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
(async () => {
  try {
    const dns = require('dns');
    if (process.env.MONGO_DNS_SERVERS) {
      const dnsServers = process.env.MONGO_DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean);
      if (dnsServers.length) {
        dns.setServers(dnsServers);
      }
    }
    await mongoose.connect(uri);
    const AppSettings = require('./models/appSettings');
    const s = await AppSettings.findOne().lean();
    console.log('AppSettings:', s || 'none');
    await mongoose.disconnect();
  } catch (e) {
    console.error('Error', e.message);
  }
})();
