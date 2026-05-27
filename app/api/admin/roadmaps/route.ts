import { NextResponse } from 'next/server';
import { createClientServer } from '@/lib/supabase-server';
import { rateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    // 1. Rate limit check (e.g. max 60 requests per minute for admin page loads)
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!rateLimit(ip, 60, 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClientServer();
    
    // 2. Resolve session user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Verify role in admin_roles
    const { data: roleData } = await supabase
      .from('admin_roles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!roleData || roleData.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Query statistics counts
    const { count: roadmapsCount } = await supabase
      .from('roadmaps')
      .select('*', { count: 'exact', head: true });

    const { count: usersCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { count: nodesCount } = await supabase
      .from('roadmap_nodes')
      .select('*', { count: 'exact', head: true });

    const { count: progressCount } = await supabase
      .from('progress_tracking')
      .select('*', { count: 'exact', head: true });

    return NextResponse.json({
      success: true,
      stats: {
        roadmaps: roadmapsCount || 0,
        students: usersCount || 0,
        topics: nodesCount || 0,
        completedTopics: progressCount || 0,
      }
    });

  } catch (err) {
    console.error("Admin stats fetch error:", err);
    // Sanitize error description output to client
    return NextResponse.json({ error: 'An internal server error occurred.' }, { status: 500 });
  }
}

