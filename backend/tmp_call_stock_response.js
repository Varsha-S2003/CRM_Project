require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const axios = require('axios');
const jwt = require('jsonwebtoken');

(async () => {
  try {
    const dealId = '69fdad0847c45d2eb1c35622';
    const token = jwt.sign({ dealId: dealId, purpose: 'low_stock_response' }, process.env.JWT_SECRET || 'secret', { expiresIn: '14d' });
    const url = `http://localhost:5000/api/deals/stock-response?action=yes&token=${encodeURIComponent(token)}`;
    console.log('Calling:', url);
    const res = await axios.get(url, { maxRedirects: 0 }).catch(e => e.response || e);
    if (!res) {
      console.log('No response');
    } else {
      console.log('Status:', res.status);
      console.log('Body snippet:', typeof res.data === 'string' ? res.data.slice(0,400) : JSON.stringify(res.data).slice(0,400));
    }
  } catch (e) {
    console.error('Error calling stock-response:', e.message || e);
  }
})();
