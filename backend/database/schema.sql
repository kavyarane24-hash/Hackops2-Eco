-- ==============================================================================
-- Environmental Intelligence & Compliance Management System (Air Pollution MVP)
-- Database Schema for Supabase (PostgreSQL)
-- Hardened Auth integration, strict RLS policies, audit triggers, and safe search_paths.
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE (Linked directly to Supabase auth.users)
-- Roles: citizen, admin, stakeholder, field_officer
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'citizen' CHECK (role IN ('citizen', 'admin', 'stakeholder', 'field_officer')),
    department TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 2. COMPLAINTS TABLE
-- Citizen reported pollution incidents
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracking_id TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL, -- e.g. industrial_smoke, garbage_burning, construction_dust, vehicular
    description TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    address TEXT,
    media_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'converted_to_incident', 'resolved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_tracking_id ON public.complaints(tracking_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON public.complaints(status);

-- ------------------------------------------------------------------------------
-- 3. INCIDENTS TABLE
-- Triaged pollution cases for Admin and Stakeholder dashboards
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID REFERENCES public.complaints(id) ON DELETE SET NULL,
    title TEXT,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'assigned', 'investigating', 'action_taken', 'resolved', 'closed')),
    assessment TEXT,
    source_hypotheses JSONB DEFAULT '[]'::JSONB,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    cpcb_comparison JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents(severity);

-- ------------------------------------------------------------------------------
-- 4. ASSIGNMENTS TABLE
-- Allocations by Admin to Stakeholders and Field Officers
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    stakeholder_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    officer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    deadline TIMESTAMPTZ,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'acknowledged', 'completed', 'overdue')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_incident_id ON public.assignments(incident_id);
CREATE INDEX IF NOT EXISTS idx_assignments_officer_id ON public.assignments(officer_id);
CREATE INDEX IF NOT EXISTS idx_assignments_stakeholder_id ON public.assignments(stakeholder_id);

-- ------------------------------------------------------------------------------
-- 5. FIELD UPDATES TABLE
-- On-site inspections, actions taken, and before/after proof media
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.field_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    officer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    inspection_notes TEXT NOT NULL,
    action_taken TEXT,
    media_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
    status_update TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_updates_incident_id ON public.field_updates(incident_id);

-- ------------------------------------------------------------------------------
-- 6. READINGS TABLE
-- Environmental sensor / API measurements (AQI, PM2.5, PM10, Weather)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
    aqi NUMERIC,
    pm2_5 NUMERIC,
    pm10 NUMERIC,
    temperature NUMERIC,
    wind_speed NUMERIC,
    wind_direction NUMERIC,
    data_source TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_incident_id ON public.readings(incident_id);
CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON public.readings(timestamp);

-- ==============================================================================
-- AUTOMATED TRIGGERS & SECURITY FUNCTIONS
-- ==============================================================================

-- 1. Automatic updated_at timestamp function (with safe search_path)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- Triggers for tables containing updated_at
DROP TRIGGER IF EXISTS set_updated_at_users ON public.users;
CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_complaints ON public.complaints;
CREATE TRIGGER set_updated_at_complaints
    BEFORE UPDATE ON public.complaints
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_incidents ON public.incidents;
CREATE TRIGGER set_updated_at_incidents
    BEFORE UPDATE ON public.incidents
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_assignments ON public.assignments;
CREATE TRIGGER set_updated_at_assignments
    BEFORE UPDATE ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Secure function to retrieve role of the current authenticated user (safe search_path)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Automatic user profile creation on auth.users registration
-- Always assigns 'citizen' role and ignores unverified metadata role requests
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, name, email, role, department)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        'citizen', -- Always 'citizen' by default. Never trust metadata role.
        NULL       -- Department can only be set by an administrator.
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.users.name),
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. Role escalation prevention trigger on public.users
-- Users can update their own profile, but only admins can change role or department
CREATE OR REPLACE FUNCTION public.prevent_user_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.role IS DISTINCT FROM OLD.role) OR (NEW.department IS DISTINCT FROM OLD.department) THEN
        IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Unauthorized: Only administrators can modify user roles or departments.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS enforce_user_role_escalation_guard ON public.users;
CREATE TRIGGER enforce_user_role_escalation_guard
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.prevent_user_role_escalation();

-- 5. Assignment protection trigger for field officers
-- Prevents officers from changing incident_id, stakeholder_id, officer_id, or deadline
CREATE OR REPLACE FUNCTION public.check_assignment_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Administrators retain full control over assignments
    IF public.current_user_role() = 'admin' THEN
        RETURN NEW;
    END IF;

    -- Non-admins must be the designated officer
    IF OLD.officer_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only update assignments allocated to you.';
    END IF;

    -- Officers can ONLY update status and notes; critical allocation fields are immutable
    IF (NEW.incident_id IS DISTINCT FROM OLD.incident_id) OR
       (NEW.stakeholder_id IS DISTINCT FROM OLD.stakeholder_id) OR
       (NEW.officer_id IS DISTINCT FROM OLD.officer_id) OR
       (NEW.deadline IS DISTINCT FROM OLD.deadline) THEN
        RAISE EXCEPTION 'Unauthorized: Officers may only update status and notes on their assigned task.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS enforce_assignment_update_guard ON public.assignments;
CREATE TRIGGER enforce_assignment_update_guard
    BEFORE UPDATE ON public.assignments
    FOR EACH ROW EXECUTE FUNCTION public.check_assignment_update();

-- 6. Privacy-preserving complaint tracking RPC function
-- Allows public / anonymous users to safely look up a specific complaint by tracking ID
-- without exposing the entire complaints table.
CREATE OR REPLACE FUNCTION public.track_complaint(p_tracking_id TEXT)
RETURNS TABLE (
    tracking_id TEXT,
    category TEXT,
    description TEXT,
    address TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.tracking_id,
        c.category,
        c.description,
        c.address,
        c.status,
        c.created_at,
        c.updated_at
    FROM public.complaints c
    WHERE c.tracking_id = p_tracking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.track_complaint(TEXT) TO anon, authenticated;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all 6 tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- RLS: USERS TABLE
-- ------------------------------------------------------------------------------
-- Users can view their own profile; staff can view directory for assignment workflows
DROP POLICY IF EXISTS "Users can view relevant profiles" ON public.users;
CREATE POLICY "Users can view relevant profiles"
    ON public.users
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id
        OR public.current_user_role() IN ('admin', 'stakeholder', 'field_officer')
    );

-- Users can update their own profile; Admins can update any profile (role protected by trigger)
DROP POLICY IF EXISTS "Users can update own profile or admin can update any" ON public.users;
CREATE POLICY "Users can update own profile or admin can update any"
    ON public.users
    FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = id
        OR public.current_user_role() = 'admin'
    )
    WITH CHECK (
        auth.uid() = id
        OR public.current_user_role() = 'admin'
    );

DROP POLICY IF EXISTS "Only admins can delete users" ON public.users;
CREATE POLICY "Only admins can delete users"
    ON public.users
    FOR DELETE
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- ------------------------------------------------------------------------------
-- RLS: COMPLAINTS TABLE (Hardened Privacy)
-- ------------------------------------------------------------------------------
-- Anyone (anon or logged in) can submit a complaint
DROP POLICY IF EXISTS "Public and users can submit complaints" ON public.complaints;
CREATE POLICY "Public and users can submit complaints"
    ON public.complaints
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Anonymous users cannot dump all complaints. Only authorized staff can view the full table.
-- Public tracking is performed via the secure track_complaint() function.
DROP POLICY IF EXISTS "Track complaint or view all complaints for staff" ON public.complaints;
DROP POLICY IF EXISTS "Staff can view all complaints" ON public.complaints;
CREATE POLICY "Staff can view all complaints"
    ON public.complaints
    FOR SELECT
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'stakeholder', 'field_officer'));

-- Only Admins or Stakeholders can update complaint triage status
DROP POLICY IF EXISTS "Admins and stakeholders can update complaints" ON public.complaints;
CREATE POLICY "Admins and stakeholders can update complaints"
    ON public.complaints
    FOR UPDATE
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'stakeholder'))
    WITH CHECK (public.current_user_role() IN ('admin', 'stakeholder'));

DROP POLICY IF EXISTS "Only admins can delete complaints" ON public.complaints;
CREATE POLICY "Only admins can delete complaints"
    ON public.complaints
    FOR DELETE
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- ------------------------------------------------------------------------------
-- RLS: INCIDENTS TABLE
-- ------------------------------------------------------------------------------
-- Incidents are visible to public / authenticated users (for air quality map overlays)
DROP POLICY IF EXISTS "Incidents are viewable by all" ON public.incidents;
CREATE POLICY "Incidents are viewable by all"
    ON public.incidents
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Admins can create incidents from triaged complaints
DROP POLICY IF EXISTS "Admins can create incidents" ON public.incidents;
CREATE POLICY "Admins can create incidents"
    ON public.incidents
    FOR INSERT
    TO authenticated
    WITH CHECK (public.current_user_role() = 'admin');

-- Staff can update incident statuses and assessments
DROP POLICY IF EXISTS "Staff can update incidents" ON public.incidents;
CREATE POLICY "Staff can update incidents"
    ON public.incidents
    FOR UPDATE
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'stakeholder', 'field_officer'))
    WITH CHECK (public.current_user_role() IN ('admin', 'stakeholder', 'field_officer'));

DROP POLICY IF EXISTS "Only admins can delete incidents" ON public.incidents;
CREATE POLICY "Only admins can delete incidents"
    ON public.incidents
    FOR DELETE
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- ------------------------------------------------------------------------------
-- RLS: ASSIGNMENTS TABLE (Strict Officer Permissions)
-- ------------------------------------------------------------------------------
-- Admins view all; Stakeholders and Officers view only assignments allocated to them
DROP POLICY IF EXISTS "View assigned tasks" ON public.assignments;
CREATE POLICY "View assigned tasks"
    ON public.assignments
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_role() = 'admin'
        OR stakeholder_id = auth.uid()
        OR officer_id = auth.uid()
    );

-- Admins can create assignments
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.assignments;
DROP POLICY IF EXISTS "Admins can create assignments" ON public.assignments;
CREATE POLICY "Admins can create assignments"
    ON public.assignments
    FOR INSERT
    TO authenticated
    WITH CHECK (public.current_user_role() = 'admin');

-- Updates allowed for Admin or assigned Officer (guarded by check_assignment_update trigger)
DROP POLICY IF EXISTS "Officers can update status on their assignment" ON public.assignments;
DROP POLICY IF EXISTS "Staff can update assignments" ON public.assignments;
CREATE POLICY "Staff can update assignments"
    ON public.assignments
    FOR UPDATE
    TO authenticated
    USING (
        public.current_user_role() = 'admin'
        OR officer_id = auth.uid()
    )
    WITH CHECK (
        public.current_user_role() = 'admin'
        OR officer_id = auth.uid()
    );

DROP POLICY IF EXISTS "Only admins can delete assignments" ON public.assignments;
CREATE POLICY "Only admins can delete assignments"
    ON public.assignments
    FOR DELETE
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- ------------------------------------------------------------------------------
-- RLS: FIELD UPDATES TABLE
-- ------------------------------------------------------------------------------
-- Staff can view inspection updates
DROP POLICY IF EXISTS "Staff can view field updates" ON public.field_updates;
CREATE POLICY "Staff can view field updates"
    ON public.field_updates
    FOR SELECT
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'stakeholder', 'field_officer'));

-- Officers can only post evidence for incidents actively assigned to them; Admins can post anytime
DROP POLICY IF EXISTS "Officers and admins can insert field updates" ON public.field_updates;
CREATE POLICY "Officers and admins can insert field updates"
    ON public.field_updates
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.current_user_role() = 'admin'
        OR (
            public.current_user_role() = 'field_officer'
            AND officer_id = auth.uid()
            AND EXISTS (
                SELECT 1 FROM public.assignments a
                WHERE a.incident_id = field_updates.incident_id
                  AND a.officer_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Only admins can delete field updates" ON public.field_updates;
CREATE POLICY "Only admins can delete field updates"
    ON public.field_updates
    FOR DELETE
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- ------------------------------------------------------------------------------
-- RLS: READINGS TABLE
-- ------------------------------------------------------------------------------
-- Environmental measurements are public for real-time dashboards and charts
DROP POLICY IF EXISTS "Readings are public" ON public.readings;
CREATE POLICY "Readings are public"
    ON public.readings
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Only admins / ingestion service can insert readings
DROP POLICY IF EXISTS "Admins can insert readings" ON public.readings;
CREATE POLICY "Admins can insert readings"
    ON public.readings
    FOR INSERT
    TO authenticated
    WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "Only admins can delete readings" ON public.readings;
CREATE POLICY "Only admins can delete readings"
    ON public.readings
    FOR DELETE
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- ==============================================================================
-- DEMO SEED DATA (FK-Safe for Fresh Database Setup)
-- ==============================================================================

-- 1. Demo Complaint (No FK dependency)
INSERT INTO public.complaints (id, tracking_id, category, description, language, latitude, longitude, address, status) VALUES
    ('55555555-5555-5555-5555-555555555555', 'ECO-2026-8910', 'industrial_smoke', 'Heavy black smoke observed from industrial chimney near residential sector.', 'en', 28.6139, 77.2090, 'Sector 12, Industrial Area, New Delhi', 'under_review')
ON CONFLICT (tracking_id) DO NOTHING;

-- 2. Demo Incident (References demo complaint)
INSERT INTO public.incidents (id, complaint_id, title, severity, status, assessment, source_hypotheses, latitude, longitude) VALUES
    ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', 'Industrial Smoke Plume Violation', 'high', 'assigned', 'Immediate inspection required. Sensor readings show elevated PM2.5 levels exceeding CPCB 24-hr threshold.', '[{"source": "Boiler Exhaust", "confidence": 0.88, "evidence": "Downwind plume aligned with 260 deg wind"}]'::jsonb, 28.6139, 77.2090)
ON CONFLICT (id) DO NOTHING;

-- 3. Demo Reading (References demo incident)
INSERT INTO public.readings (id, incident_id, aqi, pm2_5, pm10, temperature, wind_speed, wind_direction, data_source, latitude, longitude) VALUES
    ('88888888-8888-8888-8888-888888888888', '66666666-6666-6666-6666-666666666666', 312, 168.5, 245.0, 24.2, 4.8, 260.0, 'CPCB Monitoring Station 04', 28.6139, 77.2090)
ON CONFLICT (id) DO NOTHING;

-- 4. Demo Assignment (stakeholder_id and officer_id are NULL until real auth accounts register, preventing FK errors)
INSERT INTO public.assignments (id, incident_id, stakeholder_id, officer_id, deadline, notes, status) VALUES
    ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', NULL, NULL, NOW() + INTERVAL '24 hours', 'Inspect stack emissions and collect photographic evidence.', 'assigned')
ON CONFLICT (id) DO NOTHING;
