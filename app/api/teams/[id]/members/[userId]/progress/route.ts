import { NextResponse } from 'next/server';
import { verifySession, verifyTeamPermission, verifyTeamState } from '@/lib/team-security';

/**
 * GET: Retrieves comprehensive progress statistics for a team member.
 * Safe from N+1 queries by querying progress, nodes, and roadmaps in batch.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { id: teamId, userId } = await params;
    
    // 1. Verify session of the requester
    const { user, supabase } = await verifySession(request);
    
    // 2. Verify team state
    await verifyTeamState(teamId, 'read');
    
    // 3. Verify requester is active in the same team
    const { role: requesterRole, isOwner: isRequesterOwner } = await verifyTeamPermission(user.id, teamId, 'member');
    
    // 4. Verify target member is active in the same team
    const { data: targetMembership, error: targetError } = await supabase
      .from('memberships')
      .select('user_id, role, current_streak, longest_streak, last_active_at, is_active')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();
      
    if (targetError || !targetMembership) {
      return NextResponse.json({ error: 'Member not found or inactive in this team' }, { status: 404 });
    }
    
    // 5. Fetch team settings to read progress privacy configuration
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .select('settings, owner_id')
      .eq('id', teamId)
      .single();
      
    if (teamError || !teamData) {
      return NextResponse.json({ error: 'Team settings not found' }, { status: 404 });
    }
    
    const settings = teamData.settings as any;
    let progressVisibility = settings?.progress_visibility;
    
    // Backward compatibility mapping for anonymization_enabled
    if (settings?.privacy?.anonymization_enabled !== undefined) {
      progressVisibility = settings.privacy.anonymization_enabled ? 'anonymous' : 'public_team';
    } else if (settings?.anonymization_enabled !== undefined) {
      progressVisibility = settings.anonymization_enabled ? 'anonymous' : 'public_team';
    }
    
    if (!progressVisibility) {
      progressVisibility = settings?.privacy?.progress_visibility || 'public_team';
    }
    
    // 6. Security check: elevated role bypass + self-access rule
    const isSelf = user.id === userId;
    const isRequesterElevated = 
      ['website_admin', 'team_admin', 'mentor'].includes(requesterRole) || 
      isRequesterOwner || 
      user.id === teamData.owner_id;
      
    const canInspect = isSelf || isRequesterElevated || progressVisibility === 'public_team';
    
    if (!canInspect) {
      return NextResponse.json({ error: 'Forbidden: Progress visibility is restricted' }, { status: 403 });
    }
    
    // 7. Fetch progress data efficiently in 3 clean batch queries (O(1) queries)
    
    // Query 1: Fetch completed progress records
    const { data: progressRecords, error: progError } = await supabase
      .from('progress_tracking')
      .select('node_id, completed_at')
      .eq('user_id', userId)
      .eq('completed', true);
      
    if (progError) throw progError;
    
    const completedNodeIds = progressRecords?.map((r: any) => r.node_id) || [];
    
    let completedNodesInfo: any[] = [];
    let roadmapIds: string[] = [];
    
    // Query 2: Fetch nodes and roadmaps metadata
    if (completedNodeIds.length > 0) {
      const { data: nodesData, error: nodesError } = await supabase
        .from('roadmap_nodes')
        .select(`
          id,
          title,
          node_type,
          roadmap_id,
          roadmaps (
            id,
            title,
            category
          )
        `)
        .in('id', completedNodeIds);
        
      if (nodesError) throw nodesError;
      completedNodesInfo = nodesData || [];
      roadmapIds = Array.from(new Set(completedNodesInfo.map((n: any) => n.roadmap_id).filter(Boolean)));
    }
    
    // Query 3: Fetch total nodes count per started roadmap
    let totalNodesPerRoadmap: Record<string, number> = {};
    if (roadmapIds.length > 0) {
      const { data: totalNodesData, error: totalNodesError } = await supabase
        .from('roadmap_nodes')
        .select('id, roadmap_id')
        .in('roadmap_id', roadmapIds);
        
      if (totalNodesError) throw totalNodesError;
      
      totalNodesData?.forEach((node: any) => {
        if (node.roadmap_id) {
          totalNodesPerRoadmap[node.roadmap_id] = (totalNodesPerRoadmap[node.roadmap_id] || 0) + 1;
        }
      });
    }
    
    // 8. Process and structure metrics
    const roadmapStatsMap: Record<string, {
      id: string;
      title: string;
      category: string;
      completedCount: number;
      totalCount: number;
      completionPercent: number;
    }> = {};
    
    completedNodesInfo.forEach((node: any) => {
      const rid = node.roadmap_id;
      if (!rid) return;
      
      const rtitle = node.roadmaps?.title || 'Unknown Roadmap';
      const rcat = node.roadmaps?.category || 'General';
      
      if (!roadmapStatsMap[rid]) {
        const total = totalNodesPerRoadmap[rid] || 1;
        roadmapStatsMap[rid] = {
          id: rid,
          title: rtitle,
          category: rcat,
          completedCount: 0,
          totalCount: total,
          completionPercent: 0,
        };
      }
      roadmapStatsMap[rid].completedCount++;
    });
    
    // Calculate percentages
    Object.keys(roadmapStatsMap).forEach((rid) => {
      const stat = roadmapStatsMap[rid];
      stat.completionPercent = Math.round((stat.completedCount / stat.totalCount) * 100);
    });
    
    // Roadmap categories completed
    const categoriesCompleted: Record<string, number> = {};
    completedNodesInfo.forEach((node: any) => {
      const cat = node.roadmaps?.category;
      if (cat) {
        categoriesCompleted[cat] = (categoriesCompleted[cat] || 0) + 1;
      }
    });
    
    // Recently completed topics (last 10 items)
    const recentlyCompleted = progressRecords
      ?.map((rec: any) => {
        const nodeInfo = completedNodesInfo.find((n: any) => n.id === rec.node_id);
        return {
          nodeId: rec.node_id,
          title: nodeInfo?.title || 'Unknown Topic',
          roadmapTitle: nodeInfo?.roadmaps?.title || 'Unknown Roadmap',
          completedAt: rec.completed_at,
        };
      })
      .filter((item: any) => item.title !== 'Unknown Topic')
      .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, 10) || [];
      
    // Timeline of daily progress (last 30 days) for chart
    const dailyProgressMap: Record<string, number> = {};
    progressRecords?.forEach((rec: any) => {
      if (rec.completed_at) {
        const dateStr = rec.completed_at.split('T')[0];
        dailyProgressMap[dateStr] = (dailyProgressMap[dateStr] || 0) + 1;
      }
    });
    
    const dailyProgress = Object.keys(dailyProgressMap)
      .map((date) => ({ date, count: dailyProgressMap[date] }))
      .sort((a, b) => a.date.localeCompare(b.date));
      
    const startedRoadmaps = Object.values(roadmapStatsMap);
    const averageCompletion = startedRoadmaps.length > 0
      ? Math.round(startedRoadmaps.reduce((acc, curr) => acc + curr.completionPercent, 0) / startedRoadmaps.length)
      : 0;
      
    return NextResponse.json({
      success: true,
      progress: {
        completedNodesCount: completedNodeIds.length,
        streakInfo: {
          current: targetMembership.current_streak,
          longest: targetMembership.longest_streak,
        },
        lastActive: targetMembership.last_active_at,
        roadmaps: startedRoadmaps,
        averageCompletion,
        categoriesCompleted,
        recentlyCompleted,
        dailyProgress,
      }
    });
    
  } catch (err: any) {
    console.error('Member progress GET error:', err);
    const status = err.message?.includes('Unauthorized') ? 401 : err.message?.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status });
  }
}
