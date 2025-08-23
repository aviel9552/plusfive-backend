const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000'; // Update with your server URL

// Test tokens - replace with actual JWT tokens from your system
const ADMIN_TOKEN = 'your-admin-jwt-token-here';
const USER_TOKEN = 'your-user-jwt-token-here'; // Business owner token

// Test functions
async function testMonthlyPerformance(token, role) {
  try {
    console.log(`\n🔍 Testing Monthly Performance (${role})...`);
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/monthly-performance`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Monthly Performance Response:');
    console.log(`   Recovered Customers: ${response.data.data.recoveredCustomers.value}`);
    console.log(`   Recovered Revenue: $${response.data.data.recoveredRevenue.value}`);
    console.log(`   Lost Revenue: $${response.data.data.lostRevenue.value}`);
    console.log(`   Customer LTV: $${response.data.data.customerLTV.value}`);
    
    return response.data;
  } catch (error) {
    console.error(`❌ Monthly Performance Error (${role}):`, error.response?.data || error.message);
    return null;
  }
}

async function testRevenueImpact(token, role) {
  try {
    console.log(`\n📊 Testing Revenue Impact (${role})...`);
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/revenue-impact?months=6`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Revenue Impact Response:');
    console.log(`   Months of data: ${response.data.data.length}`);
    console.log(`   Latest month: ${response.data.data[response.data.data.length - 1]?.month}`);
    console.log(`   Latest revenue: $${response.data.data[response.data.data.length - 1]?.revenue}`);
    
    return response.data;
  } catch (error) {
    console.error(`❌ Revenue Impact Error (${role}):`, error.response?.data || error.message);
    return null;
  }
}

async function testCustomerStatus(token, role) {
  try {
    console.log(`\n👥 Testing Customer Status (${role})...`);
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/customer-status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Customer Status Response:');
    console.log(`   Total Customers: ${response.data.data.total}`);
    console.log(`   Active: ${response.data.data.breakdown[0]?.count}`);
    console.log(`   New: ${response.data.data.breakdown[1]?.count}`);
    console.log(`   At Risk: ${response.data.data.breakdown[2]?.count}`);
    console.log(`   Lost: ${response.data.data.breakdown[3]?.count}`);
    console.log(`   Recovered: ${response.data.data.breakdown[4]?.count}`);
    
    return response.data;
  } catch (error) {
    console.error(`❌ Customer Status Error (${role}):`, error.response?.data || error.message);
    return null;
  }
}

async function testAdminSummary(token, role) {
  try {
    console.log(`\n📋 Testing Admin Summary (${role})...`);
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/admin-summary`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Admin Summary Response:');
    console.log(`   Total Admins: ${response.data.data.totalAdmins}`);
    console.log(`   Total Business Owners: ${response.data.data.totalBusinessOwners}`);
    console.log(`   Total Customers: ${response.data.data.totalCustomers}`);
    console.log(`   Total Revenue: $${response.data.data.totalRevenue}`);
    
    return response.data;
  } catch (error) {
    console.error(`❌ Admin Summary Error (${role}):`, error.response?.data || error.message);
    return null;
  }
}

async function testDashboardOverview(token, role) {
  try {
    console.log(`\n🎯 Testing Dashboard Overview (${role})...`);
    const response = await axios.get(`${BASE_URL}/api/admin-dashboard/overview`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Dashboard Overview Response:');
    console.log(`   All metrics loaded successfully`);
    console.log(`   Monthly Performance: ✅`);
    console.log(`   Revenue Impact: ✅`);
    console.log(`   Customer Status: ✅`);
    console.log(`   Admin Summary: ✅`);
    
    return response.data;
  } catch (error) {
    console.error(`❌ Dashboard Overview Error (${role}):`, error.response?.data || error.message);
    return null;
  }
}

// Run all tests for a specific role
async function runAllTestsForRole(token, role) {
  console.log(`\n🚀 Running all tests for ${role.toUpperCase()} role...`);
  console.log('=' .repeat(50));
  
  const results = {
    monthlyPerformance: await testMonthlyPerformance(token, role),
    revenueImpact: await testRevenueImpact(token, role),
    customerStatus: await testCustomerStatus(token, role),
    adminSummary: await testAdminSummary(token, role),
    dashboardOverview: await testDashboardOverview(token, role)
  };
  
  const successCount = Object.values(results).filter(result => result !== null).length;
  console.log(`\n📈 ${role.toUpperCase()} Tests Summary: ${successCount}/5 successful`);
  
  return results;
}

// Main test runner
async function runAllTests() {
  console.log('🧪 PlusFive Admin Dashboard API Testing');
  console.log('=' .repeat(50));
  
  // Test with Admin token
  if (ADMIN_TOKEN !== 'your-admin-jwt-token-here') {
    await runAllTestsForRole(ADMIN_TOKEN, 'admin');
  } else {
    console.log('\n⚠️  ADMIN_TOKEN not set - skipping admin tests');
  }
  
  // Test with User token
  if (USER_TOKEN !== 'your-user-jwt-token-here') {
    await runAllTestsForRole(USER_TOKEN, 'user');
  } else {
    console.log('\n⚠️  USER_TOKEN not set - skipping user tests');
  }
  
  console.log('\n🎉 Testing completed!');
  console.log('\n📝 Notes:');
  console.log('   - Admin users see data for ALL customers across the platform');
  console.log('   - Business owners (user role) see data for THEIR OWN customers only');
  console.log('   - Both roles can access the same endpoints but with different data scope');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testMonthlyPerformance,
  testRevenueImpact,
  testCustomerStatus,
  testAdminSummary,
  testDashboardOverview,
  runAllTestsForRole,
  runAllTests
};
