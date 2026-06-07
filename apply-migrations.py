import os
import sys
from urllib.parse import urlparse

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv('.env.local')
except ImportError:
    pass

SUPABASE_URL = os.getenv('REACT_APP_SUPABASE_URL') or 'https://fdsqwpgwhcpceiptamfy.supabase.co'

# Extract project ID from URL
try:
    project_id = SUPABASE_URL.split('//')[1].split('.')[0]
except:
    project_id = 'fdsqwpgwhcpceiptamfy'

print("🚀 Database Migration Runner (Python)\n")
print("=" * 70)

# SQL Migrations
migrations = [
    {
        'name': 'Add bank_name column to loans table',
        'sql': 'ALTER TABLE loans ADD COLUMN IF NOT EXISTS bank_name TEXT;'
    },
    {
        'name': 'Create pending_applications table',
        'sql': '''CREATE TABLE IF NOT EXISTS pending_applications (
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
);'''
    }
]

print("\n📋 Migrations to apply:\n")
for i, m in enumerate(migrations, 1):
    print(f"{i}. {m['name']}")

print("\n⚠️  To apply these migrations automatically, you need either:")
print("   A) PostgreSQL credentials (user/password) in .env.local")
print("   B) The Supabase CLI installed and authenticated")
print("   C) Direct access through Supabase dashboard")

print("\n📝 Trying to use psycopg2 (if installed)...\n")

try:
    import psycopg2
    
    # Connection parameters
    POSTGRES_HOST = f'{project_id}.postgres.supabase.co'
    POSTGRES_USER = os.getenv('POSTGRES_USER') or 'postgres'
    POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD')
    POSTGRES_DB = os.getenv('POSTGRES_DB') or 'postgres'
    
    if not POSTGRES_PASSWORD:
        print("❌ POSTGRES_PASSWORD not found in environment")
        print("   Add POSTGRES_PASSWORD to .env.local to enable auto-migration")
        sys.exit(1)
    
    print(f"Connecting to: {POSTGRES_HOST}")
    
    conn = psycopg2.connect(
        host=POSTGRES_HOST,
        port=5432,
        database=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        sslmode='require'
    )
    
    cursor = conn.cursor()
    
    print("✅ Connected to PostgreSQL!\n")
    
    for migration in migrations:
        print(f"🔄 Running: {migration['name']}")
        try:
            cursor.execute(migration['sql'])
            conn.commit()
            print(f"✅ Success!\n")
        except Exception as e:
            conn.rollback()
            print(f"❌ Error: {str(e)}\n")
    
    cursor.close()
    conn.close()
    
    print("=" * 70)
    print("✨ All migrations completed!\n")
    
except ImportError:
    print("psycopg2 not installed")
    print("\nTo install: pip install psycopg2-binary\n")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error: {str(e)}\n")
    print("Falling back to manual SQL execution instructions...")
    print("\n" + "=" * 70)
    print("\nTo apply migrations manually:")
    print("1. Open: https://supabase.com/dashboard")
    print("2. Select your project")
    print("3. Go to: SQL Editor")
    print("4. Create a new query and paste:\n")
    
    for m in migrations:
        print(f"-- {m['name']}")
        print(m['sql'] + "\n")
    
    print("5. Click: Run")
    sys.exit(1)
