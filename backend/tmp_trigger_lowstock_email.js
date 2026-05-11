const axios = require('axios');

(async () => {
  try {
    const dealId = '69fdad0847c45d2eb1c35622';
    const url = `http://localhost:5000/api/deals/debug/send-lowstock/${dealId}`;
    console.log('Calling debug send-lowstock:', url);
    const res = await axios.get(url).catch(e => e.response || e);
    console.log('Status:', res.status);
    console.log('Body:', res.data);
  } catch (e) {
    console.error('Error:', e.message || e);
  }
})();
