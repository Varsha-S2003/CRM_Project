const axios = require('axios');

(async () => {
  try {
    const res = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@elogixa.com',
      password: '123456'
    });
    console.log('success', res.status, res.data);
  } catch (e) {
    if (e.response) {
      console.log('error', e.response.status, e.response.data);
    } else {
      console.error(e);
    }
  }
})();
