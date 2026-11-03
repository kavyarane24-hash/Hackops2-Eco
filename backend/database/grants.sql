-- ==============================================================================
-- Least-Privilege SQL Grants for Environmental Intelligence & Compliance System
-- Execute in your Supabase Dashboard -> SQL Editor
-- 
-- Why this is required:
-- In PostgreSQL, table-level grants (GRANT) must be granted to the database roles
-- ('anon' and 'authenticated') before Row Level Security (RLS) policies evaluate.
-- This script does NOT use GRANT ALL. It grants only the specific table operations
-- permitted by your existing RLS policies.
-- ==============================================================================

-- 1. Schema resolution for Supabase API roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. Complaints Table
-- Public and logged-in citizens can submit reports; Staff can read/update (RLS enforces role)
GRANT INSERT ON TABLE public.complaints TO anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.complaints TO authenticated;

-- 3. Incidents Table
-- Public can view incidents for air quality map overlays; Staff can create/update
GRANT SELECT ON TABLE public.incidents TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.incidents TO authenticated;

-- 4. Assignments Table
-- Staff can view and manage assignments (RLS restricts to Admin & designated Officer)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.assignments TO authenticated;

-- 5. Field Updates Table
-- Staff can view and insert inspection proof (RLS restricts insert to assigned Officer/Admin)
GRANT SELECT, INSERT ON TABLE public.field_updates TO authenticated;

-- 6. Readings Table
-- Public can view real-time AQI charts; Admins/services can insert sensor data
GRANT SELECT ON TABLE public.readings TO anon, authenticated;
GRANT INSERT ON TABLE public.readings TO authenticated;

-- 7. Users Table
-- Authenticated users can view directory and edit profile (trigger strictly protects role column)
GRANT SELECT, UPDATE ON TABLE public.users TO authenticated;
