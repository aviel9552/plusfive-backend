const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000'; // Update with your server URL

// Test tokens - replace with actual JWT tokens from your system
const ADMIN_TOKEN = 'your-admin-jwt-token-here';
const USER_TOKEN = 'your-user-jwt-token-here'; // Business owner token

// Test functions
async function testQRCodesWithAnalytics(token, role) {
  try {
    console.log(`\n📊 Testing QR Codes with Analytics (${role})...`);
    
    const response = await axios.get(`${BASE_URL}/api/qr/analytics`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ QR Codes with Analytics Response:');
    console.log(`   Total QR Codes: ${response.data.data.summary.totalQRCodes}`);
    console.log(`   Total Scans: ${response.data.data.summary.totalScans}`);
    console.log(`   Total Shares: ${response.data.data.summary.totalShares}`);
    console.log(`   Active QR Codes: ${response.data.data.summary.activeQRCodes}`);
    console.log(`   Average Scans per QR: ${response.data.data.summary.averageScansPerQR}`);
    console.log(`   Average Shares per QR: ${response.data.data.summary.averageSharesPerQR}`);
    
    if (response.data.data.qrCodes.length > 0) {
      console.log('\n   Sample QR Code Analytics:');
      const sampleQR = response.data.data.qrCodes[0];
      console.log(`     Name: ${sampleQR.name}`);
      console.log(`     Total Scans: ${sampleQR.analytics.totalScans}`);
      console.log(`     Total Shares: ${sampleQR.analytics.totalShares}`);
      console.log(`     Average Scans/Day: ${sampleQR.analytics.averageScansPerDay}`);
      console.log(`     Days Since Creation: ${sampleQR.analytics.daysSinceCreation}`);
    }
    
    return response.data;
  } catch (error) {
    console.error(`❌ QR Codes with Analytics Error (${role}):`, error.response?.data || error.message);
    return null;
  }
}

async function testQRPerformance(token, role) {
  try {
    console.log(`\n📈 Testing QR Performance Summary (${role})...`);
    
    const response = await axios.get(`${BASE_URL}/api/qr/performance`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ QR Performance Response:');
    console.log(`   Total QR Codes: ${response.data.data.totalQRCodes}`);
    console.log(`   Total Scans: ${response.data.data.totalScans}`);
    console.log(`   Total Shares: ${response.data.data.totalShares}`);
    console.log(`   Average Scans per QR: ${response.data.data.averageScansPerQR}`);
    console.log(`   Average Shares per QR: ${response.data.data.averageSharesPerQR}`);
    
    return response.data;
  } catch (error) {
    console.error(`❌ QR Performance Error (${role}):`, error.response?.data || error.message);
    return null;
  }
}

async function testIndividualQRAnalytics(token, role) {
  try {
    console.log(`\n🔍 Testing Individual QR Code Analytics (${role})...`);
    
    // First get a list of QR codes to test with
    const qrListResponse = await axios.get(`${BASE_URL}/api/qr/my-qr-codes`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (qrListResponse.data.data.qrCodes.length === 0) {
      console.log('   ⚠️  No QR codes found to test analytics');
      return null;
    }
    
    const firstQR = qrListResponse.data.data.qrCodes[0];
    console.log(`   Testing analytics for QR Code: ${firstQR.name} (ID: ${firstQR.id})`);
    
    const response = await axios.get(`${BASE_URL}/api/qr/${firstQR.id}/analytics`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Individual QR Analytics Response:');
    console.log(`   QR Code Name: ${response.data.data.qrCode.name}`);
    console.log(`   Status: ${response.data.data.qrCode.status}`);
    console.log(`   Total Scans: ${response.data.data.analytics.totalScans}`);
    console.log(`   Shared Count: ${response.data.data.analytics.sharedCount}`);
    console.log(`   Average Scans per Day: ${response.data.data.analytics.averageScansPerDay}`);
    
    return response.data;
  } catch (error) {
    console.error(`❌ Individual QR Analytics Error (${role}):`, error.response?.data || error.message);
    return null;
  }
}

async function testExistingQREndpoints(token, role) {
  try {
    console.log(`\n📱 Testing Existing QR Endpoints (${role})...`);
    
    // Test getting user's own QR codes
    const myQRCodesResponse = await axios.get(`${BASE_URL}/api/qr/my-qr-codes`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ My QR Codes Response:');
    console.log(`   Total QR Codes: ${myQRCodesResponse.data.data.total}`);
    
    if (myQRCodesResponse.data.data.qrCodes.length > 0) {
      console.log('   Sample QR Code:');
      const sampleQR = myQRCodesResponse.data.data.qrCodes[0];
      console.log(`     Name: ${sampleQR.name}`);
      console.log(`     Scans: ${sampleQR.scanCount}`);
      console.log(`     Shares: ${sampleQR.shareCount}`);
      console.log(`     Status: ${sampleQR.isActive ? 'Active' : 'Inactive'}`);
    }
    
    return myQRCodesResponse.data;
  } catch (error) {
    console.error(`❌ Existing QR Endpoints Error (${role}):`, error.response?.data || error.message);
    return null;
  }
}

// Run all tests for a specific role
async function runAllTestsForRole(token, role) {
  console.log(`\n🚀 Running all QR Analytics tests for ${role.toUpperCase()} role...`);
  console.log('=' .repeat(60));
  
  const results = {
    existingEndpoints: await testExistingQREndpoints(token, role),
    qrCodesWithAnalytics: await testQRCodesWithAnalytics(token, role),
    qrPerformance: await testQRPerformance(token, role),
    individualAnalytics: await testIndividualQRAnalytics(token, role)
  };
  
  const successCount = Object.values(results).filter(result => result !== null).length;
  console.log(`\n📈 ${role.toUpperCase()} QR Analytics Tests Summary: ${successCount}/4 successful`);
  
  return results;
}

// Main test runner
async function runAllTests() {
  console.log('🧪 PlusFive QR Code Analytics Testing');
  console.log('=' .repeat(60));
  
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
  
  console.log('\n🎉 QR Analytics Testing completed!');
  console.log('\n📝 New Analytics Features Added:');
  console.log('   ✅ GET /api/qr/analytics - QR codes with enhanced analytics');
  console.log('   ✅ GET /api/qr/performance - Overall performance summary');
  console.log('   ✅ GET /api/qr/:id/analytics - Individual QR code analytics');
  console.log('\n🔧 Setup Required:');
  console.log('   1. Update JWT tokens in test script');
  console.log('   2. Ensure you have QR codes created in your system');
  console.log('   3. Run: node test-qr-analytics.js');
  console.log('\n💡 Usage in Frontend:');
  console.log('   - Use /api/qr/analytics for dashboard overview');
  console.log('   - Use /api/qr/performance for summary metrics');
  console.log('   - Use /api/qr/:id/analytics for individual QR insights');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testQRCodesWithAnalytics,
  testQRPerformance,
  testIndividualQRAnalytics,
  testExistingQREndpoints,
  runAllTestsForRole,
  runAllTests
};
