#!/usr/bin/env node
/**
 * Interactive Migration Script
 * This script will help you apply the database migrations to your Supabase project
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY;

console.log("\n🚀 Loan Tracker - Database Setup Wizard\n");
console.log("=" .repeat(70));

// SQL Migrations
const migrations = [
  {
    id: 'add_bank_name',
    name: "Add bank_name column to loans table",
    description: "Adds a new 'bank_name' field to store the borrower's bank",
    sql: "ALTER TABLE loans ADD COLUMN IF NOT EXISTS bank_name TEXT;",
  },
  {
    id: 'create_pending_apps',
    name: "Create pending_applications table",
    description: "Creates table to store loan applications submitted via QR code",
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

// Check current status
async function checkStatus() {
  console.log("\n📋 Checking current database status...\n");
  
  let allReady = true;

  for (const migration of migrations) {
    try {
      if (migration.id === 'add_bank_name') {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/loans?select=bank_name&limit=1`, {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        });
        
        if (response.ok) {
          console.log(`✅ ${migration.name}`);
        } else {
          console.log(`❌ ${migration.name}`);
          allReady = false;
        }
      } else if (migration.id === 'create_pending_apps') {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/pending_applications?limit=1`, {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
        });
        
        if (response.ok || response.status === 400) {
          console.log(`✅ ${migration.name}`);
        } else {
          console.log(`❌ ${migration.name}`);
          allReady = false;
        }
      }
    } catch (error) {
      console.log(`⚠️  ${migration.name} - Unable to verify`);
      allReady = false;
    }
  }

  return allReady;
}

// Generate migration file
function generateMigrationFile() {
  const filename = `supabase-migrations-${new Date().toISOString().split('T')[0]}.sql`;
  const filepath = path.join(__dirname, filename);
  
  const content = `-- Loan Tracker Database Migrations
-- Generated: ${new Date().toISOString()}
-- Run these SQL commands in your Supabase SQL Editor

${migrations.map(m => `-- ${m.name}\n-- ${m.description}\n${m.sql}`).join('\n\n')}
`;

  fs.writeFileSync(filepath, content);
  return filepath;
}

// Main execution
async function main() {
  console.log(`\nProject: ${SUPABASE_URL}`);
  console.log("=" .repeat(70));
  
  const isReady = await checkStatus();
  
  if (isReady) {
    console.log("\n✨ All migrations are already applied! Your database is up to date.\n");
    process.exit(0);
  }

  console.log("\n" + "=" .repeat(70));
  console.log("\n📝 NEXT STEPS - Apply Missing Migrations:\n");
  
  console.log("Option 1: Using Supabase Dashboard (Recommended)");
  console.log("-".repeat(70));
  console.log("1. Open: https://supabase.com/dashboard");
  console.log("2. Select your project");
  console.log("3. Go to: SQL Editor (left sidebar)");
  console.log("4. Click: New Query");
  console.log("5. Copy & paste this SQL:\n");
  
  console.log("--- START SQL ---");
  migrations.forEach(m => {
    console.log(`\n-- ${m.name}`);
    console.log(m.sql);
  });
  console.log("\n--- END SQL ---\n");
  
  console.log("6. Click: Run");
  console.log("7. Done! Your database is now up to date.\n");

  console.log("=" .repeat(70));
  console.log("\nOption 2: Save SQL to File");
  const migrationFile = generateMigrationFile();
  console.log(`SQL saved to: ${migrationFile}\n`);

  console.log("=" .repeat(70));
  console.log("\nOnce you've applied the migrations, run this to verify:");
  console.log("  node verify-schema.js\n");
}

main().catch(error => {
  console.error("Error:", error.message);
  process.exit(1);
});
