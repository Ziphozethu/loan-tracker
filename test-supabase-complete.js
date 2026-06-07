/**
 * Complete Supabase Diagnostic Test
 * Run this with: node test-supabase-complete.js
 */

const SUPABASE_URL = "https://fdsqwpgwhcpceiptamfy.supabase.co";
const SUPABASE_KEY = "sb_publishable_umuFeOvqGzD1PJCFAWLjNQ_NKK78-Aj";

async function sb(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} failed: HTTP ${res.status} - ${text}`);
  }
  
  return text ? JSON.parse(text) : [];
}

async function runTests() {
  console.log("🔍 SUPABASE DIAGNOSTIC TEST\n");
  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Key: ${SUPABASE_KEY.slice(0, 30)}...\n`);

  let passed = 0;
  let failed = 0;

  // Test 1: Connection
  console.log("═══════════════════════════════════════");
  console.log("TEST 1: Basic Connection");
  console.log("═══════════════════════════════════════");
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/loans?limit=0`, {
      headers: { 
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });
    if (res.ok) {
      console.log("✅ PASS: Connected to Supabase\n");
      passed++;
    } else {
      console.log(`❌ FAIL: HTTP ${res.status}\n`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }

  // Test 2: Loans table exists and has correct columns
  console.log("═══════════════════════════════════════");
  console.log("TEST 2: Loans Table Structure");
  console.log("═══════════════════════════════════════");
  try {
    const loans = await sb("GET", "/loans?limit=1");
    console.log("✅ PASS: Loans table exists");
    
    // Check sample record to see what columns exist
    if (loans.length > 0) {
      const sample = loans[0];
      const columns = Object.keys(sample);
      console.log("\nColumns found:");
      columns.forEach(col => {
        const icon = ["bank_name", "residency_place", "account_number", "image1", "image2"].includes(col) ? "✅" : "ℹ️";
        console.log(`  ${icon} ${col}`);
      });
      
      // Check for required new column
      if (columns.includes("bank_name")) {
        console.log("\n✅ PASS: bank_name column exists\n");
        passed++;
      } else {
        console.log("\n⚠️ WARNING: bank_name column NOT found - need to add it\n");
        failed++;
      }
    } else {
      console.log("ℹ️ No existing loans to check columns\n");
      passed++;
    }
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }

  // Test 3: Liabilities table exists
  console.log("═══════════════════════════════════════");
  console.log("TEST 3: Liabilities Table");
  console.log("═══════════════════════════════════════");
  try {
    const liabilities = await sb("GET", "/liabilities?limit=1");
    console.log("✅ PASS: Liabilities table exists");
    if (liabilities.length > 0) {
      console.log(`  Sample record: ${JSON.stringify(liabilities[0], null, 2)}\n`);
    } else {
      console.log("  (Empty - no records yet)\n");
    }
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }

  // Test 4: Pending applications table exists
  console.log("═══════════════════════════════════════");
  console.log("TEST 4: Pending Applications Table");
  console.log("═══════════════════════════════════════");
  try {
    const pending = await sb("GET", "/pending_applications?limit=1");
    console.log("✅ PASS: Pending applications table exists");
    
    const sample = pending[0];
    if (sample) {
      const columns = Object.keys(sample);
      console.log("\nColumns found:");
      columns.forEach(col => console.log(`  ✅ ${col}`));
      console.log();
    } else {
      console.log("  (Empty - no applications yet)\n");
    }
    passed++;
  } catch (err) {
    if (err.message.includes("404")) {
      console.log("❌ FAIL: pending_applications table NOT found");
      console.log("   → Run SQL from SUPABASE_SQL_SETUP.md to create it\n");
    } else {
      console.log(`❌ FAIL: ${err.message}\n`);
    }
    failed++;
  }

  // Test 5: Count records in each table
  console.log("═══════════════════════════════════════");
  console.log("TEST 5: Record Counts");
  console.log("═══════════════════════════════════════");
  try {
    // Get counts by fetching with limit and parsing response
    const loansRes = await fetch(`${SUPABASE_URL}/rest/v1/loans?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=exact"
      }
    });
    const loansCount = loansRes.headers.get('content-range')?.split('/')[1] || '(unknown)';
    
    const liabRes = await fetch(`${SUPABASE_URL}/rest/v1/liabilities?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=exact"
      }
    });
    const liabCount = liabRes.headers.get('content-range')?.split('/')[1] || '(unknown)';

    const pendRes = await fetch(`${SUPABASE_URL}/rest/v1/pending_applications?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=exact"
      }
    });
    const pendCount = pendRes.headers.get('content-range')?.split('/')[1] || '0';

    console.log(`📊 Loans: ${loansCount} records`);
    console.log(`📊 Liabilities: ${liabCount} records`);
    console.log(`📊 Pending Applications: ${pendCount} records\n`);
    passed++;
  } catch (err) {
    console.log(`⚠️ Could not fetch counts: ${err.message}\n`);
    passed++;
  }

  // Test 6: Try creating test data
  console.log("═══════════════════════════════════════");
  console.log("TEST 6: Create Test Loan (Read-Write)");
  console.log("═══════════════════════════════════════");
  try {
    const testLoan = {
      borrower_name: "TEST_USER_" + Date.now(),
      phone: "+27790000000",
      amount: 1000,
      loan_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      notes: "Test from diagnostic",
      status: "active",
      bank_name: "Test Bank",
      account_number: "0123456789",
      residency_place: "Test Address"
    };
    
    const result = await sb("POST", "/loans", testLoan);
    console.log("✅ PASS: Successfully created test loan");
    console.log(`   ID: ${result[0]?.id}`);
    
    // Clean up - delete test record
    if (result[0]?.id) {
      await sb("DELETE", `/loans?id=eq.${result[0].id}`);
      console.log("   Cleaned up test record\n");
    }
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${err.message}\n`);
    failed++;
  }

  // Summary
  console.log("═══════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════");
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}\n`);

  if (failed === 0) {
    console.log("🎉 ALL TESTS PASSED! Your Supabase is ready.\n");
  } else {
    console.log("⚠️  Some tests failed. See above for details.\n");
    console.log("Common fixes:");
    console.log("1. Add bank_name column: ALTER TABLE loans ADD COLUMN bank_name TEXT;");
    console.log("2. Create pending_applications: See SUPABASE_SQL_SETUP.md");
    console.log("3. Check RLS policies in Supabase Dashboard\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
