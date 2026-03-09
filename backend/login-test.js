const axios = require('axios');

axios.post('http://localhost:5000/api/auth/login', { email: 'admin@elogixa.com', password: '123456' })
  .then(r => console.log('OK', r.data))
  .catch(e => console.error('err', e.response?.data || e.message));
