-- Loan Tracker Database Migrations
-- Generated: 2026-06-07T00:30:22.620Z
-- Run these SQL commands in your Supabase SQL Editor

-- Add bank_name column to loans table
-- Adds a new 'bank_name' field to store the borrower's bank
ALTER TABLE loans ADD COLUMN IF NOT EXISTS bank_name TEXT;

-- Create pending_applications table
-- Creates table to store loan applications submitted via QR code
CREATE TABLE IF NOT EXISTS pending_applications (
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
);
