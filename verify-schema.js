require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY;

async function checkSchema() {
  console.log("🔍 Checking Database Schema...\n");

  // Test 1: Check if loans table exists and has bank_name column
  console.log("1️⃣  Testing loans table...");
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/loans?select=bank_name&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (response.ok) {
      console.log("✅ loans table exists and bank_name column is accessible\n");
    } else if (response.status === 400) {
      console.log("⚠️  loans table may exist but bank_name column might be missing");
      console.log("   Run the migration SQL to add the bank_name column\n");
    }
  } catch (error) {
    console.log("❌ Error checking loans table:", error.message, "\n");
  }

  // Test 2: Check if pending_applications table exists
  console.log("2️⃣  Testing pending_applications table...");
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/pending_applications?limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (response.ok) {
      console.log("✅ pending_applications table exists and is accessible\n");
    } else if (response.status === 404 || response.status === 400) {
      console.log("❌ pending_applications table does not exist");
      console.log("   Run the migration SQL to create this table\n");
    }
  } catch (error) {
    console.log("❌ Error checking pending_applications table:", error.message, "\n");
  }

  console.log("=" .repeat(70));
  console.log("\n✨ Schema Check Complete!\n");
  console.log("If any checks failed, run the migration SQL:");
  console.log("  node run-migrations.js\n");
}

checkSchema();
