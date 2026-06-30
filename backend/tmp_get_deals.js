const axios = require('axios');

(async () => {
  try {
    console.log('Seeding users (calling /seed-users)...');
    await axios.get('http://localhost:5000/seed-users').catch(() => {});
    console.log('Logging in as admin...');
    const login = await axios.post('http://localhost:5000/api/auth/login', { email: 'admin@elogixa.com', password: '123456' });
    const token = login.data.token;
    console.log('Token received. Fetching deals...');
    const res = await axios.get('http://localhost:5000/api/deals', { headers: { Authorization: `Bearer ${token}` } });
    const deals = res.data || [];
    console.log('Deals count:', deals.length);
    if (deals.length > 0) {
      console.log('First deal id:', deals[0]._id);
      console.log('Sample deal:', JSON.stringify(deals[0], null, 2));
    } else {
      console.log('No deals found in DB.');
    }
  } catch (err) {
    console.error('Error during debug:', err.response?.data || err.message);
  }
})();
