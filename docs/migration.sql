-- 1. Add schema version and lock columns to roadmaps table
ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS schema_version TEXT DEFAULT 'v1';
ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE roadmaps ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE;

-- 2. Add columns to roadmap_nodes table
ALTER TABLE roadmap_nodes ADD COLUMN IF NOT EXISTS roadmap_id UUID REFERENCES roadmaps(id) ON DELETE CASCADE;
ALTER TABLE roadmap_nodes ADD COLUMN IF NOT EXISTS x_position NUMERIC DEFAULT 0;
ALTER TABLE roadmap_nodes ADD COLUMN IF NOT EXISTS y_position NUMERIC DEFAULT 0;
ALTER TABLE roadmap_nodes ADD COLUMN IF NOT EXISTS node_type TEXT DEFAULT 'topic';
ALTER TABLE roadmap_nodes ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE roadmap_nodes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 3. Make section_id nullable in roadmap_nodes (retaining the column for backward compatibility)
ALTER TABLE roadmap_nodes ALTER COLUMN section_id DROP NOT NULL;

-- 4. Create roadmap_edges table
CREATE TABLE IF NOT EXISTS roadmap_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id UUID REFERENCES roadmaps(id) ON DELETE CASCADE,
    source_node_id UUID REFERENCES roadmap_nodes(id) ON DELETE CASCADE,
    target_node_id UUID REFERENCES roadmap_nodes(id) ON DELETE CASCADE,
    label TEXT,
    styling_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Create roadmap_versions table for autosave and rollback snapshots
CREATE TABLE IF NOT EXISTS roadmap_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roadmap_id UUID REFERENCES roadmaps(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    nodes_data JSONB NOT NULL,
    edges_data JSONB NOT NULL,
    is_autosave BOOLEAN DEFAULT false
);

-- 6. Enable Row Level Security (RLS) on new tables
ALTER TABLE roadmap_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE roadmap_versions ENABLE ROW LEVEL SECURITY;

-- 7. Policies for roadmap_edges
DROP POLICY IF EXISTS "Allow public read access to roadmap_edges" ON roadmap_edges;
CREATE POLICY "Allow public read access to roadmap_edges" ON roadmap_edges
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow admin write access to roadmap_edges" ON roadmap_edges;
CREATE POLICY "Allow admin write access to roadmap_edges" ON roadmap_edges
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    );

-- 8. Policies for roadmap_versions
DROP POLICY IF EXISTS "Allow admin full access to roadmap_versions" ON roadmap_versions;
CREATE POLICY "Allow admin full access to roadmap_versions" ON roadmap_versions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM admin_roles
            WHERE admin_roles.id = auth.uid() AND admin_roles.role = 'admin'
        )
    );

-- 9. Server-side atomic transaction migration PL/pgSQL function
CREATE OR REPLACE FUNCTION migrate_roadmap_to_v2(target_roadmap_id UUID)
RETURNS VOID AS $$
DECLARE
    sec_record RECORD;
    node_record RECORD;
    sec_index INT := 0;
    node_index INT := 0;
    prev_node_id UUID := NULL;
    first_node_in_sec UUID := NULL;
    last_node_of_prev_sec UUID := NULL;
BEGIN
    -- Check if already v2
    IF EXISTS (
        SELECT 1 FROM roadmaps
        WHERE id = target_roadmap_id AND schema_version = 'v2'
    ) THEN
        RETURN;
    END IF;

    -- Ensure all existing nodes for this roadmap reference target_roadmap_id
    UPDATE roadmap_nodes n
    SET roadmap_id = target_roadmap_id
    FROM roadmap_sections s
    WHERE n.section_id = s.id AND s.roadmap_id = target_roadmap_id;

    -- Loop through sections sequentially
    FOR sec_record IN (
        SELECT id FROM roadmap_sections
        WHERE roadmap_id = target_roadmap_id
        ORDER BY order_index ASC, id ASC
    ) LOOP
        node_index := 0;
        first_node_in_sec := NULL;

        -- Loop through nodes in section
        FOR node_record IN (
            SELECT id FROM roadmap_nodes
            WHERE section_id = sec_record.id
            ORDER BY order_index ASC, id ASC
        ) LOOP
            -- Assign position based on grid row (section) and column (node index)
            UPDATE roadmap_nodes
            SET x_position = 100 + (node_index * 250),
                y_position = 100 + (sec_index * 300),
                node_type = 'topic'
            WHERE id = node_record.id;

            -- Build edge within section
            IF prev_node_id IS NOT NULL THEN
                INSERT INTO roadmap_edges (roadmap_id, source_node_id, target_node_id)
                VALUES (target_roadmap_id, prev_node_id, node_record.id);
            END IF;

            IF first_node_in_sec IS NULL THEN
                first_node_in_sec := node_record.id;
            END IF;

            prev_node_id := node_record.id;
            node_index := node_index + 1;
        END LOOP;

        -- Build edge connecting previous section's last node to this section's first node
        IF last_node_of_prev_sec IS NOT NULL AND first_node_in_sec IS NOT NULL THEN
            INSERT INTO roadmap_edges (roadmap_id, source_node_id, target_node_id)
            VALUES (target_roadmap_id, last_node_of_prev_sec, first_node_in_sec);
        END IF;

        IF prev_node_id IS NOT NULL THEN
            last_node_of_prev_sec := prev_node_id;
        END IF;

        prev_node_id := NULL;
        sec_index := sec_index + 1;
    END LOOP;

    -- Mark the roadmap as v2
    UPDATE roadmaps
    SET schema_version = 'v2'
    WHERE id = target_roadmap_id;

END;
$$ LANGUAGE plpgsql;
