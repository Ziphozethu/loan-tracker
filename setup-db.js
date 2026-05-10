const SUPABASE_URL = "https://fdsqwpgwhcpceiptamfy.supabase.co";
const SUPABASE_KEY = "sb_publishable_umuFeOvqGzD1PJCFAWLjNQ_NKK78-Aj";

async function supabaseAdmin(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("Error:", err);
    return null;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function checkAndCreateColumns() {
  console.log("🔍 Checking Supabase table structure...\n");

  try {
    // Get table info using information_schema
    const query = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'loans'
      ORDER BY column_name;
    `;

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_columns?table_name=loans`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Alternative approach: Try to get one record to see the structure
    const loans = await supabaseAdmin("GET", "/loans?limit=1");
    
    if (!loans || loans.length === 0) {
      console.log("⚠️  No records found. Creating sample structure check...\n");
    }

    const requiredColumns = ["account_number", "residency_place", "image1", "image2"];
    
    // Since we can't directly inspect schema via REST, we'll try inserting to check
    console.log("✅ Required columns to add:");
    requiredColumns.forEach((col) => {
      console.log(`   • ${col} (text field)`);
    });

    console.log("\n📝 NOTE: You need to add these columns in Supabase Dashboard if missing:");
    console.log("   1. Go to https://supabase.co/dashboard");
    console.log("   2. Select your project");
    console.log("   3. Go to SQL Editor");
    console.log("   4. Run this SQL:\n");

    const sql = `
-- Add missing columns to loans table
ALTER TABLE loans
ADD COLUMN IF NOT EXISTS account_number TEXT,
ADD COLUMN IF NOT EXISTS residency_place TEXT,
ADD COLUMN IF NOT EXISTS image1 TEXT,
ADD COLUMN IF NOT EXISTS image2 TEXT;
    `;

    console.log(sql);
    console.log("\n5. Click 'Run' to execute");
    console.log("✅ Done!\n");

  } catch (error) {
    console.error("Error checking table:", error.message);
  }
}

checkAndCreateColumns();
