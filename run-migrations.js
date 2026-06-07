require('dotenv').config({ path: '.env.local' });

console.log("🚀 Database Migration Setup\n");
console.log("=" .repeat(70));

const migrations = [
  {
    name: "Add bank_name column to loans table",
    sql: "ALTER TABLE loans ADD COLUMN IF NOT EXISTS bank_name TEXT;",
  },
  {
    name: "Create pending_applications table",
    sql: `CREATE TABLE IF NOT EXISTS pending_applications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrower_name    TEXT NOT NULL,
  phone            TEXT NOT NULL,
  account_number   TEXT,
  bank_name        TEXT,
  residency_place  TEXT,
  amount           NUMERIC NOT NULL,
  due_date         DATE NOT NULL,
  image1           TEXT,
  image2           TEXT,
  status           TEXT DEFAULT 'pending',
  submitted_at     TIMESTAMPTZ DEFAULT NOW()
);`,
  },
];

console.log("\n📋 SQL Commands to Execute:\n");

migrations.forEach((migration, index) => {
  console.log(`${index + 1}. ${migration.name}`);
  console.log(`   ${migration.sql}\n`);
});

console.log("=" .repeat(70));
console.log("\n✨ TO APPLY THESE CHANGES:");
console.log("\n1. Go to Supabase Dashboard: https://supabase.com/dashboard");
console.log("2. Select your project");
console.log("3. Go to SQL Editor (left sidebar)");
console.log("4. Create a new query");
console.log("5. Copy & paste the SQL commands above");
console.log("6. Click 'Run'\n");

console.log("SUPABASE_URL:", process.env.REACT_APP_SUPABASE_URL);
console.log("\n✅ Copy the SQL above and paste it into Supabase SQL Editor");
