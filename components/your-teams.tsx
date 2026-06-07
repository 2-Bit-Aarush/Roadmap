"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Pin, Star, Users, Target, Calendar, ArrowRight, Activity, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { CreateTeamModal } from '@/components/create-team-modal';

export function YourTeams() {
  const router = useRouter();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function loadTeams() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setLoading(false);
          return;
        }
        setUser(session.user);

        // Fetch user profile and check website_admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        const { data: adminRole } = await supabase
          .from('admin_roles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        const isWebAdmin = (profile && profile.role === 'website_admin') || (adminRole && adminRole.role === 'admin');
        setIsAdmin(!!isWebAdmin);

        // Fetch user's teams from API
        const response = await fetch('/api/teams');
        const data = await response.json();
        
        if (data.success) {
          setTeams(data.teams || []);
        } else {
          console.error('Failed to load teams:', data.error);
        }
      } catch (err) {
        console.error('Error fetching teams:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTeams();
  }, []);

  const handleTogglePin = async (teamId: string, currentPin: boolean) => {
    try {
      const res = await fetch(`/api/teams/${teamId}/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: !currentPin }),
      });
      const data = await res.json();
      if (data.success) {
        setTeams((prev) =>
          prev
            .map((t) => (t.id === teamId ? { ...t, is_pinned: data.is_pinned } : t))
            .sort((a, b) => {
              if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
              if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
              return 0;
            })
        );
        toast.success(data.is_pinned ? 'Team pinned to top' : 'Team unpinned');
      }
    } catch (err) {
      toast.error('Failed to toggle pin state');
    }
  };

  const handleToggleFavorite = async (teamId: string, currentFav: boolean) => {
    try {
      const res = await fetch(`/api/teams/${teamId}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !currentFav }),
      });
      const data = await res.json();
      if (data.success) {
        setTeams((prev) =>
          prev
            .map((t) => (t.id === teamId ? { ...t, is_favorite: data.is_favorite } : t))
            .sort((a, b) => {
              if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
              if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
              return 0;
            })
        );
        toast.success(data.is_favorite ? 'Team added to favorites' : 'Team removed from favorites');
      }
    } catch (err) {
      toast.error('Failed to toggle favorite state');
    }
  };

  if (!user) return null;

  return (
    <section className="relative py-16 px-4 md:px-8 max-w-6xl mx-auto w-full">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            Your Teams
          </h2>
          <p className="text-white/40 text-sm mt-1">
            Collaborate, complete roadmaps, and track learning milestones.
          </p>
        </div>
        {!loading && isAdmin && (
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white border-0 cursor-pointer h-10 px-4 text-sm gap-2 shrink-0 self-start sm:self-auto"
          >
            <Sparkles className="h-4 w-4" />
            Create Team
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
          <div className="h-32 bg-white/[0.02] border border-white/[0.05] rounded-2xl" />
          <div className="h-32 bg-white/[0.02] border border-white/[0.05] rounded-2xl" />
        </div>
      ) : teams.length === 0 ? (
        <div className="border border-white/[0.05] bg-black/40 backdrop-blur-sm rounded-2xl p-10 text-center max-w-md mx-auto">
          <Target className="h-10 w-10 text-purple-400/50 mx-auto mb-3" />
          <p className="text-white font-semibold mb-1">You're not part of any team yet</p>
          <p className="text-white/40 text-xs mb-6">Ask a team administrator to invite you or generate a join code.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {teams.map((team, idx) => (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.05 }}
              className={cn(
                "group relative p-6 rounded-2xl border bg-black/40 backdrop-blur-sm hover:border-purple-500/30 transition-all flex flex-col justify-between shadow-lg",
                team.is_pinned ? "border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.05)]" : "border-white/[0.06]"
              )}
            >
              {/* Header card actions */}
              <div className="flex justify-between items-start gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-white text-lg font-bold">
                    {team.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-white font-bold group-hover:text-purple-300 transition-colors flex items-center gap-1.5">
                      {team.name}
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50 shrink-0">
                        {team.role === 'team_admin' ? 'Admin' : team.role}
                      </span>
                    </h3>
                    <p className="text-white/40 text-[10px] mt-0.5">
                      Last Active: {team.last_active_at ? new Date(team.last_active_at).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1 shrink-0 z-10">
                  <button
                    onClick={() => handleToggleFavorite(team.id, team.is_favorite)}
                    className={cn(
                      "p-1.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/5 transition-colors cursor-pointer",
                      team.is_favorite ? "text-amber-400 border-amber-500/10 bg-amber-500/5" : "text-white/40 hover:text-white"
                    )}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleTogglePin(team.id, team.is_pinned)}
                    className={cn(
                      "p-1.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/5 transition-colors cursor-pointer",
                      team.is_pinned ? "text-purple-400 border-purple-500/10 bg-purple-500/5" : "text-white/40 hover:text-white"
                    )}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Goal Description Preview */}
              <div className="space-y-3 pt-3 border-t border-white/[0.04] mb-4">
                {team.goal && (
                  <div className="flex items-start gap-2 text-xs text-white/60">
                    <Target className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span className="line-clamp-1">Goal: {team.goal}</span>
                  </div>
                )}
                
                {/* Active snippets feed (last 3 snippets preview) */}
                {team.snippets && team.snippets.length > 0 && (
                  <div className="space-y-1">
                    {team.snippets.map((snip: any, sIdx: number) => (
                      <div key={sIdx} className="flex items-center gap-1.5 text-[10px] text-white/40">
                        <Activity className="h-3 w-3 text-purple-400/50 shrink-0" />
                        <span className="truncate">
                          {snip.type === 'joined_team' ? 'A member joined' :
                           snip.type === 'resource_added' ? 'New resource shared' :
                           snip.type === 'agenda_updated' ? 'Agenda updated' : 'Activity logged'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom stats and button */}
              <div className="flex items-center justify-between gap-4 pt-3 border-t border-white/[0.04]">
                <div className="flex items-center gap-4 text-[11px] text-white/50">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5 text-purple-400" />
                    {team.memberCount || 1}
                  </span>
                  <span>
                    Completion: <strong className="text-purple-400">{team.metrics?.completion_rate || 0}%</strong>
                  </span>
                </div>

                <Button
                  size="sm"
                  onClick={() => router.push(`/teams/${team.id}`)}
                  className="bg-purple-600 hover:bg-purple-700 text-white border-0 cursor-pointer h-7 text-xs gap-1"
                >
                  Enter
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <CreateTeamModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={(newTeam) => {
          const formattedTeam = {
            ...newTeam,
            role: 'team_admin',
            is_pinned: false,
            is_favorite: false,
            joined_at: new Date().toISOString(),
            metrics: { completion_rate: 0, active_members: 1, weekly_activity: 0 },
            snippets: []
          };
          setTeams(prev => [formattedTeam, ...prev]);
        }}
      />
    </section>
  );
}
