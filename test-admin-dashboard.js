const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000'; // Adjust to your server URL
const ADMIN_TOKEN = 'your-admin-jwt-token-here'; // Replace with actual admin token

const headers = {
  'Authorization': `Bearer ${ADMIN_TOKEN}`,
  'Content-Type': 'application/json'
};

// Test functions
async function testMonthlyPerformance() {
  try {
    console.log('🧪 Testing Monthly Performance...');
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/monthly-performance?month=7&year=2024`, { headers });
    console.log('✅ Monthly Performance:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Monthly Performance Error:', error.response?.data || error.message);
  }
}

async function testRevenueImpact() {
  try {
    console.log('🧪 Testing Revenue Impact...');
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/revenue-impact?months=6`, { headers });
    console.log('✅ Revenue Impact:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Revenue Impact Error:', error.response?.data || error.message);
  }
}

async function testCustomerStatus() {
  try {
    console.log('🧪 Testing Customer Status...');
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/customer-status`, { headers });
    console.log('✅ Customer Status:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Customer Status Error:', error.response?.data || error.message);
  }
}

async function testAdminSummary() {
  try {
    console.log('🧪 Testing Admin Summary...');
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/admin-summary`, { headers });
    console.log('✅ Admin Summary:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Admin Summary Error:', error.response?.data || error.message);
  }
}

async function testDashboardOverview() {
  try {
    console.log('🧪 Testing Dashboard Overview...');
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/overview?month=7&year=2024&months=6`, { headers });
    console.log('✅ Dashboard Overview:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Dashboard Overview Error:', error.response?.data || error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Admin Dashboard API Tests...\n');
  
  await testMonthlyPerformance();
  console.log('');
  
  await testRevenueImpact();
  console.log('');
  
  await testCustomerStatus();
  console.log('');
  
  await testAdminSummary();
  console.log('');
  
  await testDashboardOverview();
  console.log('');
  
  console.log('✨ All tests completed!');
}

// Check if running directly
if (require.main === module) {
  if (!ADMIN_TOKEN || ADMIN_TOKEN === 'your-admin-jwt-token-here') {
    console.error('❌ Please set a valid ADMIN_TOKEN in the script');
    console.log('💡 You can get a token by logging in as an admin user');
    process.exit(1);
  }
  
  runAllTests().catch(console.error);
}

module.exports = {
  testMonthlyPerformance,
  testRevenueImpact,
  testCustomerStatus,
  testAdminSummary,
  testDashboardOverview
};
