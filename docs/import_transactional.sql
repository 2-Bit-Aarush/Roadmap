-- 1. Add import columns to roadmaps table
ALTER TABLE public.roadmaps ADD COLUMN IF NOT EXISTS import_state TEXT DEFAULT 'ready';
ALTER TABLE public.roadmaps ADD COLUMN IF NOT EXISTS import_metadata JSONB DEFAULT '{}'::jsonb;

-- 2. Transaction-safe import RPC Function
CREATE OR REPLACE FUNCTION public.import_roadmap_transactional(
    p_roadmap_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_category TEXT,
    p_difficulty TEXT,
    p_estimated_duration TEXT,
    p_is_published BOOLEAN,
    p_nodes JSONB, -- array of nodes: [{id, title, description, x, y, node_type, color, resources}]
    p_edges JSONB, -- array of edges: [{id, source, target, label}]
    p_import_mode TEXT, -- 'overwrite' | 'merge' | 'duplicate'
    p_admin_id UUID,
    p_import_metadata JSONB
)
RETURNS UUID AS $$
DECLARE
    v_roadmap_id UUID;
    v_lock_holder UUID;
    v_lock_time TIMESTAMP WITH TIME ZONE;
    v_role TEXT;
    node_rec RECORD;
    edge_rec RECORD;
    v_node_id UUID;
    v_edge_id UUID;
    v_source_uuid UUID;
    v_target_uuid UUID;
    v_upserted_node_ids UUID[] := ARRAY[]::UUID[];
    v_upserted_edge_ids UUID[] := ARRAY[]::UUID[];
BEGIN
    -- 1. Verify admin role
    SELECT role INTO v_role FROM public.admin_roles WHERE id = p_admin_id;
    IF v_role IS NULL OR v_role != 'admin' THEN
        RAISE EXCEPTION 'Access denied: Admin role required';
    END IF;

    -- 2. Determine target roadmap_id
    IF p_import_mode = 'duplicate' OR p_roadmap_id IS NULL THEN
        -- Create a new roadmap
        INSERT INTO public.roadmaps (
            title, description, category, difficulty, estimated_duration, is_published, created_by, schema_version, import_state, import_metadata, created_at, updated_at
        ) VALUES (
            p_title, p_description, p_category, p_difficulty, p_estimated_duration, p_is_published, p_admin_id, 'v2', 'ready', p_import_metadata, timezone('utc'::text, now()), timezone('utc'::text, now())
        ) RETURNING id INTO v_roadmap_id;
    ELSE
        -- Update existing roadmap
        -- Verify locks
        SELECT locked_by, locked_at INTO v_lock_holder, v_lock_time FROM public.roadmaps WHERE id = p_roadmap_id;
        IF v_lock_holder IS NOT NULL AND v_lock_holder != p_admin_id AND (timezone('utc'::text, now()) - v_lock_time) < INTERVAL '5 minutes' THEN
            RAISE EXCEPTION 'Roadmap is currently locked by another administrator';
        END IF;

        UPDATE public.roadmaps SET
            title = p_title,
            description = p_description,
            category = p_category,
            difficulty = p_difficulty,
            estimated_duration = p_estimated_duration,
            is_published = p_is_published,
            schema_version = 'v2',
            import_state = 'ready',
            import_metadata = p_import_metadata,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_roadmap_id;

        v_roadmap_id := p_roadmap_id;
    END IF;

    -- 3. Capture Pre-Import Snapshot (if overwriting or merging)
    IF p_import_mode IN ('overwrite', 'merge') AND EXISTS (SELECT 1 FROM public.roadmap_nodes WHERE roadmap_id = v_roadmap_id) THEN
        INSERT INTO public.roadmap_versions (roadmap_id, nodes_data, edges_data, is_autosave, created_at)
        SELECT
            v_roadmap_id,
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
                ) FROM public.roadmap_nodes WHERE roadmap_id = v_roadmap_id),
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
                ) FROM public.roadmap_edges WHERE roadmap_id = v_roadmap_id),
                '[]'::jsonb
            ),
            false,
            timezone('utc'::text, now());
    END IF;

    -- Create temporary table for node ID resolution
    CREATE TEMP TABLE temp_node_map (
        ext_id TEXT,
        db_id UUID
    ) ON COMMIT DROP;

    -- 4. Process and insert/upsert nodes
    FOR node_rec IN SELECT * FROM jsonb_to_recordset(p_nodes) AS x(
        id TEXT,
        title TEXT,
        description TEXT,
        x NUMERIC,
        y NUMERIC,
        node_type TEXT,
        color TEXT,
        resources JSONB
    ) LOOP
        -- Resolve UUID
        v_node_id := NULL;
        IF p_import_mode IN ('overwrite', 'merge') THEN
            -- Check if node with this external_id already exists on this roadmap
            SELECT id INTO v_node_id FROM public.roadmap_nodes 
            WHERE roadmap_id = v_roadmap_id AND metadata->>'external_id' = node_rec.id;
        END IF;

        IF v_node_id IS NULL THEN
            -- Check if the input id is a valid UUID, if so we can reuse it, otherwise generate a new one
            BEGIN
                v_node_id := node_rec.id::UUID;
            EXCEPTION WHEN OTHERS THEN
                v_node_id := gen_random_uuid();
            END;
        END IF;

        -- Store node ID mapping
        INSERT INTO temp_node_map (ext_id, db_id) VALUES (node_rec.id, v_node_id);
        v_upserted_node_ids := array_append(v_upserted_node_ids, v_node_id);

        -- Upsert node
        INSERT INTO public.roadmap_nodes (
            id, roadmap_id, title, description, x_position, y_position, node_type, color, resources, metadata, updated_at
        ) VALUES (
            v_node_id,
            v_roadmap_id,
            node_rec.title,
            COALESCE(node_rec.description, ''),
            COALESCE(node_rec.x, 0),
            COALESCE(node_rec.y, 0),
            COALESCE(node_rec.node_type, 'topic'),
            COALESCE(node_rec.color, '#3b82f6'),
            COALESCE(node_rec.resources, '[]'::jsonb),
            jsonb_build_object('external_id', node_rec.id),
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

    -- 5. Process and insert/upsert edges
    FOR edge_rec IN SELECT * FROM jsonb_to_recordset(p_edges) AS x(
        id TEXT,
        source TEXT,
        target TEXT,
        label TEXT
    ) LOOP
        -- Look up database UUIDs for source and target
        SELECT db_id INTO v_source_uuid FROM temp_node_map WHERE ext_id = edge_rec.source;
        SELECT db_id INTO v_target_uuid FROM temp_node_map WHERE ext_id = edge_rec.target;

        IF v_source_uuid IS NOT NULL AND v_target_uuid IS NOT NULL THEN
            -- Check if edge already exists
            v_edge_id := NULL;
            IF p_import_mode IN ('overwrite', 'merge') THEN
                SELECT id INTO v_edge_id FROM public.roadmap_edges 
                WHERE roadmap_id = v_roadmap_id AND source_node_id = v_source_uuid AND target_node_id = v_target_uuid;
            END IF;

            IF v_edge_id IS NULL THEN
                BEGIN
                    v_edge_id := edge_rec.id::UUID;
                EXCEPTION WHEN OTHERS THEN
                    v_edge_id := gen_random_uuid();
                END;
            END IF;

            v_upserted_edge_ids := array_append(v_upserted_edge_ids, v_edge_id);

            INSERT INTO public.roadmap_edges (
                id, roadmap_id, source_node_id, target_node_id, label, styling_metadata, created_at
            ) VALUES (
                v_edge_id,
                v_roadmap_id,
                v_source_uuid,
                v_target_uuid,
                COALESCE(edge_rec.label, ''),
                '{}'::jsonb,
                timezone('utc'::text, now())
            )
            ON CONFLICT (id) DO UPDATE SET
                source_node_id = EXCLUDED.source_node_id,
                target_node_id = EXCLUDED.target_node_id,
                label = EXCLUDED.label;
        END IF;
    END LOOP;

    -- 6. Clean up orphans in overwrite mode
    IF p_import_mode = 'overwrite' THEN
        -- Delete edges not in upserted list
        DELETE FROM public.roadmap_edges 
        WHERE roadmap_id = v_roadmap_id AND id != ALL(v_upserted_edge_ids);

        -- Delete nodes not in upserted list
        DELETE FROM public.roadmap_nodes 
        WHERE roadmap_id = v_roadmap_id AND id != ALL(v_upserted_node_ids);
    END IF;

    -- 7. Add admin audit log
    INSERT INTO public.admin_logs (
        admin_id, action, details, created_at
    ) VALUES (
        p_admin_id,
        'import_roadmap',
        jsonb_build_object(
            'roadmap_id', v_roadmap_id,
            'title', p_title,
            'mode', p_import_mode,
            'nodes_count', jsonb_array_length(p_nodes),
            'edges_count', jsonb_array_length(p_edges),
            'source_type', p_import_metadata->>'import_type',
            'warnings_count', COALESCE((p_import_metadata->>'warnings_count')::int, 0),
            'detected_sections_count', COALESCE((p_import_metadata->>'detected_sections_count')::int, 0),
            'generated_nodes_count', COALESCE((p_import_metadata->>'generated_nodes_count')::int, jsonb_array_length(p_nodes)),
            'generated_edges_count', COALESCE((p_import_metadata->>'generated_edges_count')::int, jsonb_array_length(p_edges))
        ),
        timezone('utc'::text, now())
    );

    RETURN v_roadmap_id;

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Transactional import failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke public execution and grant to authenticated role
ALTER FUNCTION public.import_roadmap_transactional(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, JSONB, TEXT, UUID, JSONB
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.import_roadmap_transactional(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, JSONB, TEXT, UUID, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.import_roadmap_transactional(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, JSONB, TEXT, UUID, JSONB
) TO authenticated;
