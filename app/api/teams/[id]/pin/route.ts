import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/team-security';

/**
 * POST: Toggles or sets is_pinned status of a team membership.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    const { isPinned } = body;
    if (isPinned === undefined) {
      return NextResponse.json({ error: 'isPinned field is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('memberships')
      .update({ is_pinned: isPinned })
      .eq('team_id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, is_pinned: data.is_pinned });
  } catch (err: any) {
    console.error('Pin POST error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}
