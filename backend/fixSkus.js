// Script to fix products with null SKUs via API
const axios = require("axios");

const API_URL = "http://localhost:5000/api/products/fix-skus";

async function fixSkus() {
  try {
    // Get token from user
    const token = process.env.TOKEN;
    
    if (!token) {
      console.log("Please set TOKEN environment variable");
      console.log("Example: TOKEN=your_jwt_token node fixSkus.js");
      process.exit(1);
    }

    const res = await axios.post(API_URL, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log(res.data.message);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.response?.data?.message || err.message);
    process.exit(1);
  }
}

fixSkus();

