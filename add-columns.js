const SUPABASE_URL = "https://fdsqwpgwhcpceiptamfy.supabase.co";
const SUPABASE_KEY = "sb_publishable_umuFeOvqGzD1PJCFAWLjNQ_NKK78-Aj";

async function addMissingColumns() {
  console.log("🔧 Adding missing columns to Supabase loans table...\n");

  try {
    // Try to add columns by executing SQL via Supabase
    const sql = `
      ALTER TABLE IF EXISTS loans
      ADD COLUMN IF NOT EXISTS account_number TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS residency_place TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS image1 TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS image2 TEXT DEFAULT NULL;
    `;

    // Attempt 1: Try via RPC if available
    console.log("📝 Attempt 1: Using Supabase SQL execution...");
    const rpcResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/execute_sql`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (rpcResponse.ok) {
      console.log("✅ RPC execution successful!\n");
      console.log("✅ Columns added to loans table:");
      console.log("   • account_number (TEXT)");
      console.log("   • residency_place (TEXT)");
      console.log("   • image1 (TEXT)");
      console.log("   • image2 (TEXT)\n");
      return;
    }

    // Attempt 2: Try to verify by inserting a test record
    console.log(
      "📝 Attempt 2: Verifying via table access...\n"
    );

    const testRecord = {
      borrower_name: "Test User",
      phone: "+27 12 345 6789",
      account_number: "TEST_ACCOUNT",
      residency_place: "Test Location",
      amount: 1000,
      loan_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
      notes: "Verification record",
      status: "active",
      image1: null,
      image2: null,
    };

    const insertResponse = await fetch(`${SUPABASE_URL}/rest/v1/loans`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(testRecord),
    });

    if (insertResponse.ok) {
      const inserted = await insertResponse.json();
      console.log("✅ Test record inserted successfully!");
      console.log(
        "✅ This confirms the columns exist or were auto-created:\n"
      );

      // Delete the test record
      await fetch(`${SUPABASE_URL}/rest/v1/loans?id=eq.${inserted[0].id}`, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });

      console.log("   ✅ account_number");
      console.log("   ✅ residency_place");
      console.log("   ✅ image1");
      console.log("   ✅ image2\n");
      console.log("🎉 Database is ready!\n");
      return;
    } else {
      const error = await insertResponse.json();
      console.error("⚠️  Insert failed. Error:", error);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }

  console.log(
    "\n⚠️  If columns are still missing, please add them manually:\n"
  );
  console.log("1. Go to: https://supabase.com/dashboard/project/fdsqwpgwhcpceiptamfy/sql");
  console.log("2. Click 'New Query'");
  console.log("3. Paste this SQL:\n");
  const sql = `ALTER TABLE loans
ADD COLUMN IF NOT EXISTS account_number TEXT,
ADD COLUMN IF NOT EXISTS residency_place TEXT,
ADD COLUMN IF NOT EXISTS image1 TEXT,
ADD COLUMN IF NOT EXISTS image2 TEXT;`;
  console.log(sql);
  console.log("\n4. Click 'Run'");
}

addMissingColumns();
