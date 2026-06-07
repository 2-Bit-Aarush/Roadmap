import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * GET: Lists members in the team (supports search, pagination, and dynamic presence calculation).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`[DIAGNOSTIC] members/route GET started. Team ID: ${id}`);
    
    let userSession: any = null;
    try {
      const { user, supabase } = await verifySession(request);
      userSession = user;
      console.log(`[DIAGNOSTIC] Session verified. User ID: ${userSession.id}`);
      
      // 1. Verify access permissions
      console.log(`[DIAGNOSTIC] Verifying team state for team ID: ${id}`);
      await verifyTeamState(id, 'read');
      console.log(`[DIAGNOSTIC] Team state verified successfully.`);
      
      console.log(`[DIAGNOSTIC] Verifying team membership for user ID: ${userSession.id}`);
      const membershipLookup = await verifyTeamPermission(userSession.id, id, 'member');
      console.log(`[DIAGNOSTIC] Team membership verified. Role: ${membershipLookup.role}, isOwner: ${membershipLookup.isOwner}`);

      // Parse query params
      const { searchParams } = new URL(request.url);
      const search = searchParams.get('search') || '';
      const page = parseInt(searchParams.get('page') || '1', 10);
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const offset = (page - 1) * limit;

      console.log(`[DIAGNOSTIC] Querying memberships with profiles for team ID: ${id}`);
      // 2. Fetch memberships joined with profile metadata (membership-first)
      let query = supabase
        .from('memberships')
        .select(`
          user_id,
          role,
          joined_at,
          is_active,
          last_active_at,
          current_streak,
          longest_streak,
          display_name,
          profiles!inner (
            id,
            name,
            avatar_url,
            email
          )
        `)
        .eq('team_id', id)
        .eq('is_active', true);

      const { data: memberships, error } = await query;
      
      if (error) {
        console.error(`[DIAGNOSTIC] memberships query failed. Error code: ${error.code}, message: ${error.message}, details: ${error.details}`);
        return NextResponse.json({ 
          success: false, 
          error: `Database error: ${error.message} (Code: ${error.code})`, 
          details: error.details 
        }, { status: 500 });
      }

      console.log(`[DIAGNOSTIC] memberships query succeeded. Raw Count: ${memberships?.length}`);

      // Apply in-memory search filtering
      let filtered = memberships || [];
      if (search) {
        const cleanSearch = search.toLowerCase();
        filtered = filtered.filter((m: any) => {
          const displayName = (m.display_name || '').toLowerCase();
          const profileName = (m.profiles?.name || '').toLowerCase();
          const profileEmail = (m.profiles?.email || '').toLowerCase();
          return displayName.includes(cleanSearch) || 
                 profileName.includes(cleanSearch) || 
                 profileEmail.includes(cleanSearch);
        });
      }

      // Apply in-memory alphabetical sorting by display_name (falling back to profiles.name)
      filtered.sort((a: any, b: any) => {
        const nameA = (a.display_name || a.profiles?.name || 'Unknown User').toLowerCase();
        const nameB = (b.display_name || b.profiles?.name || 'Unknown User').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      // Apply pagination
      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      // 3. Derive dynamic presence states and map singular profile compatibility
      const now = new Date().getTime();
      const list = paginated.map((m: any) => {
        const lastActiveTime = new Date(m.last_active_at).getTime();
        const diffMin = (now - lastActiveTime) / (1000 * 60);

        let status = 'offline';
        if (diffMin <= 5) {
          status = 'online';
        } else if (diffMin <= 60 * 24) {
          status = 'recently_active';
        }

        return {
          ...m,
          profile: m.profiles, // Singular compatibility mapping
          presenceStatus: status,
        };
      });

      return NextResponse.json({
        success: true,
        members: list,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }
      });
    } catch (authOrVerificationErr: any) {
      console.error(`[DIAGNOSTIC] Auth or verification error in members route:`, authOrVerificationErr);
      return NextResponse.json({ 
        success: false, 
        error: authOrVerificationErr.message || 'Verification failed',
        user_id: userSession?.id,
        team_id: id 
      }, { status: authOrVerificationErr.message?.includes('Unauthorized') ? 401 : 403 });
    }
  } catch (err: any) {
    console.error('[DIAGNOSTIC] members GET top-level crash:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST: Directly adds/invites a member (Team Admin or Website Admin only).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, supabase } = await verifySession(request);
    const body = await request.json();

    const { targetEmail, role: assignRole, displayName } = body;
    if (!targetEmail) {
      return NextResponse.json({ error: 'Target member email is required' }, { status: 400 });
    }

    if (!displayName || !displayName.trim()) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }

    const nameTrimmed = displayName.trim();
    if (nameTrimmed.length < 2 || nameTrimmed.length > 40) {
      return NextResponse.json({ error: 'Display name must be between 2 and 40 characters' }, { status: 400 });
    }

    // Validate uniqueness of display name within this team
    const { data: activeMembers } = await supabase
      .from('memberships')
      .select('display_name, profiles(name)')
      .eq('team_id', id)
      .eq('is_active', true);

    const isDuplicate = activeMembers?.some((m: any) => {
      const name = m.display_name || m.profiles?.name || '';
      return name.toLowerCase() === nameTrimmed.toLowerCase();
    });

    if (isDuplicate) {
      return NextResponse.json({ error: 'Display name is already taken inside this team.' }, { status: 400 });
    }

    // 1. Verify team states and admin permissions
    await verifyTeamState(id, 'membership_change');
    await verifyTeamPermission(user.id, id, 'team_admin');

    // 2. Resolve target user from profile
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', targetEmail)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: 'User not found. They must sign up first.' }, { status: 404 });
    }

    // Check member limit at API layer
    const { data: teamData } = await supabase
      .from('teams')
      .select('member_limit')
      .eq('id', id)
      .single();

    if (teamData?.member_limit !== null) {
      const { count: activeCount } = await supabase
        .from('memberships')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', id)
        .eq('is_active', true);

      if (activeCount !== null && activeCount >= teamData.member_limit) {
        return NextResponse.json({ error: `Team size limit of ${teamData.member_limit} members reached` }, { status: 400 });
      }
    }

    // 3. Check if they are already in the team
    const { data: existingMember } = await supabase
      .from('memberships')
      .select('is_active')
      .eq('team_id', id)
      .eq('user_id', targetProfile.id)
      .single();

    if (existingMember) {
      if (existingMember.is_active) {
        return NextResponse.json({ error: 'User is already an active member of this team.' }, { status: 400 });
      }
      
      // Reactivate membership
      const { error: reactivateError } = await supabase
        .from('memberships')
        .update({
          is_active: true,
          role: assignRole || 'member',
          joined_at: new Date().toISOString(),
          invited_by: user.id,
          display_name: nameTrimmed,
        })
        .eq('team_id', id)
        .eq('user_id', targetProfile.id);

      if (reactivateError) throw reactivateError;
    } else {
      // 4. Create membership record (database trigger enforces hierarchy rules)
      const { error: insertError } = await supabase
        .from('memberships')
        .insert({
          team_id: id,
          user_id: targetProfile.id,
          role: assignRole || 'member',
          is_active: true,
          invited_by: user.id,
          display_name: nameTrimmed,
        });

      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true, message: 'Member added successfully' });
  } catch (err: any) {
    console.error('Members POST error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
