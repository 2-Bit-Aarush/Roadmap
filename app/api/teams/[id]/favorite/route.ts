import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/team-security';

/**
 * POST: Toggles or sets is_favorite status of a team membership.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    const { isFavorite } = body;
    if (isFavorite === undefined) {
      return NextResponse.json({ error: 'isFavorite field is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('memberships')
      .update({ is_favorite: isFavorite })
      .eq('team_id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, is_favorite: data.is_favorite });
  } catch (err: any) {
    console.error('Favorite POST error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}
