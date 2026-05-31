-- ==========================================
-- 0. BACKUP & EXECUTION PROCEDURES
-- ==========================================
-- STEP 1: Backup current production tables
--   CREATE TABLE roadmap_nodes_backup AS SELECT * FROM roadmap_nodes;
--   CREATE TABLE roadmap_edges_backup AS SELECT * FROM roadmap_edges;
--   CREATE TABLE roadmaps_backup AS SELECT * FROM roadmaps;
--
-- STEP 2: Run this SQL migration script in the database.
--
-- STEP 3: Verification & testing checkpoints:
--   - Test collaboration: Open the flowchart editor in two tabs under different admins, and verify that lock states synchronize.
--   - Test roadmap save: Save changes to verify the transaction-safe save pipeline and conflict detection works.
--   - Test force unlock: Verify taking over the editing lock from another admin logs the event in admin_logs.
--   - Test rollback/version history: Create multiple canvas snapshots and verify restoring them maintains stable UUIDs.

-- ==========================================
-- 1. Create save_roadmap_graph RPC Function
-- ==========================================

CREATE OR REPLACE FUNCTION public.save_roadmap_graph(
    target_roadmap_id UUID,
    nodes_to_upsert JSONB,
    node_ids_to_delete UUID[],
    edges_to_upsert JSONB,
    edge_ids_to_delete UUID[],
    is_autosave_mode BOOLEAN
)
RETURNS VOID AS $$
DECLARE
    node_rec RECORD;
    edge_rec RECORD;
    verified_node_ids UUID[];
BEGIN
    -- Validation checks
    IF target_roadmap_id IS NULL THEN
        RAISE EXCEPTION 'roadmap id required';
    END IF;

    -- A. Delete removed edges first
    IF array_length(edge_ids_to_delete, 1) > 0 THEN
        DELETE FROM public.roadmap_edges
        WHERE id = ANY(edge_ids_to_delete) AND roadmap_id = target_roadmap_id;
    END IF;

    -- B. Delete removed nodes
    IF array_length(node_ids_to_delete, 1) > 0 THEN
        DELETE FROM public.roadmap_nodes
        WHERE id = ANY(node_ids_to_delete) AND roadmap_id = target_roadmap_id;
    END IF;

    -- C. Upsert nodes
    FOR node_rec IN SELECT * FROM jsonb_to_recordset(nodes_to_upsert) AS x(
        id UUID,
        title TEXT,
        description TEXT,
        x_position NUMERIC,
        y_position NUMERIC,
        node_type TEXT,
        color TEXT,
        resources JSONB,
        metadata JSONB
    ) LOOP
        INSERT INTO public.roadmap_nodes (id, roadmap_id, title, description, x_position, y_position, node_type, color, resources, metadata, updated_at)
        VALUES (
            node_rec.id,
            target_roadmap_id,
            node_rec.title,
            node_rec.description,
            node_rec.x_position,
            node_rec.y_position,
            node_rec.node_type,
            node_rec.color,
            node_rec.resources,
            node_rec.metadata,
            timezone('utc'::text, now())
        )
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            x_position = EXCLUDED.x_position,
            y_position = EXCLUDED.y_position,
            node_type = EXCLUDED.node_type,
            color = EXCLUDED.color,
            resources = EXCLUDED.resources,
            metadata = EXCLUDED.metadata,
            updated_at = timezone('utc'::text, now());
    END LOOP;

    -- D. Retrieve and verify all nodes currently belonging to the roadmap (safely handling empty nodes)
    SELECT COALESCE(
        array_agg(id),
        ARRAY[]::UUID[]
    ) INTO verified_node_ids FROM public.roadmap_nodes WHERE roadmap_id = target_roadmap_id;

    -- E. Upsert validated edges (only if both source and target nodes exist in the current roadmap)
    FOR edge_rec IN SELECT * FROM jsonb_to_recordset(edges_to_upsert) AS x(
        id UUID,
        source_node_id UUID,
        target_node_id UUID,
        label TEXT,
        styling_metadata JSONB
    ) LOOP
        IF edge_rec.source_node_id = ANY(verified_node_ids) AND edge_rec.target_node_id = ANY(verified_node_ids) THEN
            INSERT INTO public.roadmap_edges (id, roadmap_id, source_node_id, target_node_id, label, styling_metadata, created_at)
            VALUES (
                edge_rec.id,
                target_roadmap_id,
                edge_rec.source_node_id,
                edge_rec.target_node_id,
                edge_rec.label,
                edge_rec.styling_metadata,
                timezone('utc'::text, now())
            )
            ON CONFLICT (id) DO UPDATE SET
                source_node_id = EXCLUDED.source_node_id,
                target_node_id = EXCLUDED.target_node_id,
                label = EXCLUDED.label,
                styling_metadata = EXCLUDED.styling_metadata;
        ELSE
            RAISE NOTICE 'Skipping invalid edge % -> %', edge_rec.source_node_id, edge_rec.target_node_id;
        END IF;
    END LOOP;

    -- F. Update parent roadmap's updated_at timestamp
    UPDATE public.roadmaps
    SET updated_at = timezone('utc'::text, now())
    WHERE id = target_roadmap_id;

    -- G. Insert Version history snapshot
    INSERT INTO public.roadmap_versions (roadmap_id, nodes_data, edges_data, is_autosave, created_at)
    SELECT
        target_roadmap_id,
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'label', title,
                    'description', description,
                    'x', x_position,
                    'y', y_position,
                    'node_type', node_type,
                    'color', color,
                    'resources', resources,
                    'metadata', metadata
                )
            ) FROM public.roadmap_nodes WHERE roadmap_id = target_roadmap_id),
            '[]'::jsonb
        ),
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'source', source_node_id,
                    'target', target_node_id,
                    'label', label
                )
            ) FROM public.roadmap_edges WHERE roadmap_id = target_roadmap_id),
            '[]'::jsonb
        ),
        is_autosave_mode,
        timezone('utc'::text, now());

    -- H. Enforce 20-snapshot retention limit for autosaves (preserve manual snapshots indefinitely)
    DELETE FROM public.roadmap_versions
    WHERE id NOT IN (
        SELECT id FROM public.roadmap_versions
        WHERE roadmap_id = target_roadmap_id AND is_autosave = true
        ORDER BY created_at DESC
        LIMIT 20
    ) AND roadmap_id = target_roadmap_id AND is_autosave = true;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'save_roadmap_graph failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Set owner to postgres, revoke public execution, and grant to authenticated role
ALTER FUNCTION public.save_roadmap_graph(
    UUID,
    JSONB,
    UUID[],
    JSONB,
    UUID[],
    BOOLEAN
) OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.save_roadmap_graph(
    UUID,
    JSONB,
    UUID[],
    JSONB,
    UUID[],
    BOOLEAN
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.save_roadmap_graph(
    UUID,
    JSONB,
    UUID[],
    JSONB,
    UUID[],
    BOOLEAN
)
TO authenticated;

-- ==========================================
-- 2. Grant Full Access to Admins on All Tables
-- ==========================================

-- Enable RLS on all relevant tables
ALTER TABLE public.roadmaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_tracking ENABLE ROW LEVEL SECURITY;

-- 2.1 Policies for 'roadmaps'
DROP POLICY IF EXISTS "Allow admins full access to roadmaps" ON public.roadmaps;
DROP POLICY IF EXISTS "Allow creator access" ON public.roadmaps;
DROP POLICY IF EXISTS "Allow creator write access" ON public.roadmaps;
CREATE POLICY "Allow admins full access to roadmaps" ON public.roadmaps
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Allow public read access to published roadmaps" ON public.roadmaps;
CREATE POLICY "Allow public read access to published roadmaps" ON public.roadmaps
    FOR SELECT USING (is_published = true);

-- Schema validation for roadmap_sections relation
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'roadmap_sections';

-- 2.2 Policies for 'roadmap_sections'
DROP POLICY IF EXISTS "Allow admins full access to roadmap_sections" ON public.roadmap_sections;
DROP POLICY IF EXISTS "Allow creator write access to roadmap_sections" ON public.roadmap_sections;
CREATE POLICY "Allow admins full access to roadmap_sections" ON public.roadmap_sections
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Allow public read access to roadmap_sections" ON public.roadmap_sections;
CREATE POLICY "Allow public read access to roadmap_sections" ON public.roadmap_sections
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.roadmaps
            WHERE roadmaps.id = roadmap_sections.roadmap_id AND roadmaps.is_published = true
        )
    );

-- 2.3 Policies for 'roadmap_nodes'
DROP POLICY IF EXISTS "Allow admins full access to roadmap_nodes" ON public.roadmap_nodes;
DROP POLICY IF EXISTS "Allow creator write access to roadmap_nodes" ON public.roadmap_nodes;
CREATE POLICY "Allow admins full access to roadmap_nodes" ON public.roadmap_nodes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Allow public read access to roadmap_nodes" ON public.roadmap_nodes;
CREATE POLICY "Allow public read access to roadmap_nodes" ON public.roadmap_nodes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.roadmaps
            WHERE roadmaps.id = roadmap_nodes.roadmap_id AND roadmaps.is_published = true
        )
    );

-- 2.4 Policies for 'roadmap_edges'
DROP POLICY IF EXISTS "Allow admins full access to roadmap_edges" ON public.roadmap_edges;
DROP POLICY IF EXISTS "Allow admin write access to roadmap_edges" ON public.roadmap_edges;
DROP POLICY IF EXISTS "Allow admin write access to roadmap_edges" ON roadmap_edges;
DROP POLICY IF EXISTS "Allow public read access to roadmap_edges" ON public.roadmap_edges;
DROP POLICY IF EXISTS "Allow public read access to roadmap_edges" ON roadmap_edges;
CREATE POLICY "Allow admins full access to roadmap_edges" ON public.roadmap_edges
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Allow public read access to roadmap_edges" ON public.roadmap_edges;
CREATE POLICY "Allow public read access to roadmap_edges" ON public.roadmap_edges
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.roadmaps
            WHERE roadmaps.id = roadmap_edges.roadmap_id AND roadmaps.is_published = true
        )
    );

-- 2.5 Policies for 'roadmap_versions'
DROP POLICY IF EXISTS "Allow admins full access to roadmap_versions" ON public.roadmap_versions;
DROP POLICY IF EXISTS "Allow admin full access to roadmap_versions" ON public.roadmap_versions;
DROP POLICY IF EXISTS "Allow admin full access to roadmap_versions" ON roadmap_versions;
CREATE POLICY "Allow admins full access to roadmap_versions" ON public.roadmap_versions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    );

-- 2.6 Policies for 'admin_logs'
DROP POLICY IF EXISTS "Allow admins full access to admin_logs" ON public.admin_logs;
CREATE POLICY "Allow admins full access to admin_logs" ON public.admin_logs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    );

-- 2.7 Policies for 'progress_tracking'
DROP POLICY IF EXISTS "Allow admins read access to progress_tracking" ON public.progress_tracking;
CREATE POLICY "Allow admins read access to progress_tracking" ON public.progress_tracking
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Allow users full access to their own progress" ON public.progress_tracking;
CREATE POLICY "Allow users full access to their own progress" ON public.progress_tracking
    FOR ALL
    USING (
        user_id = auth.uid()
    )
    WITH CHECK (
        user_id = auth.uid()
    );
