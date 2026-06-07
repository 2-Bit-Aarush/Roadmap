"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Target, Calendar, Activity, BookOpen, Settings, BarChart2,
  Lock, RefreshCw, Plus, Trash2, ShieldAlert, Star, Pin, LogOut,
  UserCheck, AlertTriangle, FileSpreadsheet, Play, Power, ShieldOff, Sparkles, Send, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Navbar } from '@/components/navbar';
import { Sidebar } from '@/components/sidebar';
import { Footer } from '@/components/footer';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { CrypticText } from '@/components/cryptic-text';
import { ExportStatusCard } from '@/components/export-status-card';
import PixelBlast from '@/components/team/PixelBlast';
import Shuffle from '@/components/team/TeamNameAnimation';
import { knightWarrior } from '@/app/fonts';

export default function TeamDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'activity' | 'analytics' | 'agenda' | 'resources' | 'settings'>('overview');
  const [team, setTeam] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Lists
  const [members, setMembers] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [agendas, setAgendas] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  // Sub-loading states for async parallel fetching
  const [membersLoading, setMembersLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [milestonesLoading, setMilestonesLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Sub-error states for parallel fetching
  const [membersError, setMembersError] = useState<string | null>(null);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);


  // Exporters State
  const [triggerExport, setTriggerExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');

  // Input states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [newResourceTitle, setNewResourceTitle] = useState('');
  const [newResourceUrl, setNewResourceUrl] = useState('');
  const [newAgendaTitle, setNewAgendaTitle] = useState('');
  const [newAgendaStart, setNewAgendaStart] = useState('');
  const [newAgendaEnd, setNewAgendaEnd] = useState('');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');

  // Poll members list to refresh presence status dynamically
  useEffect(() => {
    if (!id) return;
    loadTeamData();

    // Heartbeat for presence: refresh roster and active states every 30s
    const interval = setInterval(fetchMembers, 30000);
    return () => clearInterval(interval);
  }, [id]);

  const loadTeamData = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/teams/${id}`);
      const data = await res.json();
      if (data.success) {
        setTeam(data.team);
        setLoading(false); // Let the page layout render immediately!
      } else {
        toast.error(data.error || 'Failed to load team details.');
        router.push('/dashboard');
        return;
      }

      // Run sub-fetches concurrently in parallel (non-blocking)
      fetchMembers();
      fetchActivities();
      fetchResources();
      fetchMilestones();
      fetchAnalytics();
    } catch (err) {
      toast.error('Error loading team details');
      setLoading(false);
    }
  };

  const refreshTeamDataBackground = async () => {
    try {
      const res = await fetch(`/api/teams/${id}`);
      const data = await res.json();
      if (data.success) {
        setTeam(data.team);
      }
    } catch (err) {
      console.error('Error refreshing team data in background:', err);
    }
  };

  const fetchMembers = async () => {
    try {
      setMembersLoading(true);
      setMembersError(null);
      const res = await fetch(`/api/teams/${id}/members`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Members roster unavailable');
      }
      if (data.success) setMembers(data.members || []);
    } catch (err: any) {
      console.error('Members fetch failed:', err);
      setMembersError('Members roster unavailable');
      toast.error('Could not load team members');
    } finally {
      setMembersLoading(false);
    }
  };

  const fetchActivities = async () => {
    try {
      setActivitiesLoading(true);
      setActivitiesError(null);
      const res = await fetch(`/api/teams/${id}/activities?limit=10`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Activities unavailable');
      }
      if (data.success) setActivities(data.activities || []);
    } catch (err: any) {
      console.error('Activities fetch failed:', err);
      setActivitiesError('Activities unavailable');
      toast.error('Could not load activity feed');
    } finally {
      setActivitiesLoading(false);
    }
  };

  const fetchResources = async () => {
    try {
      setResourcesLoading(true);
      setResourcesError(null);
      const res = await fetch(`/api/teams/${id}/resources`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Resources unavailable');
      }
      if (data.success) setResources(data.resources || []);
    } catch (err: any) {
      console.error('Resources fetch failed:', err);
      setResourcesError('Resources unavailable');
      toast.error('Could not load shared resources');
    } finally {
      setResourcesLoading(false);
    }
  };

  const fetchMilestones = async () => {
    try {
      setMilestonesLoading(true);
      const res = await fetch(`/api/teams/${id}/milestones`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.success) {
        setMilestones(data.milestones || []);
        setChallenges(data.challenges || []);
        setAgendas(data.agendas || []);
      }
    } catch (err) {
      console.error('Milestones fetch failed:', err);
      toast.error('Could not load milestones & agendas');
    } finally {
      setMilestonesLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      const res = await fetch(`/api/teams/${id}/analytics`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Analytics unavailable');
      }
      if (data.success) setAnalytics(data.stats);
    } catch (err: any) {
      console.error('Analytics fetch failed:', err);
      setAnalyticsError('Analytics unavailable');
      toast.error('Could not load team analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const getMemberPresenceStatus = (memberOrId: any) => {
    const member = typeof memberOrId === 'string'
      ? members.find((m) => m.user_id === memberOrId)
      : memberOrId;

    if (!member || !member.last_active_at) return 'offline';

    const lastActiveTime = new Date(member.last_active_at).getTime();
    const now = new Date().getTime();
    const diffMin = (now - lastActiveTime) / (1000 * 60);

    if (diffMin <= 5) {
      return 'online';
    } else if (diffMin <= 60 * 24) {
      return 'recently_active';
    }
    return 'offline';
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    
    if (!inviteDisplayName || !inviteDisplayName.trim()) {
      toast.error('Display name is required.');
      return;
    }
    const nameTrimmed = inviteDisplayName.trim();
    if (nameTrimmed.length < 2 || nameTrimmed.length > 40) {
      toast.error('Display name must be between 2 and 40 characters.');
      return;
    }

    const nameExists = members.some(m => {
      const resolvedName = (m.display_name?.trim()) || (m.profile?.name?.trim()) || (m.profiles?.name?.trim()) || (m.name?.trim()) || '';
      return resolvedName.toLowerCase() === nameTrimmed.toLowerCase();
    });
    if (nameExists) {
      toast.error('Display name is already taken inside this team.');
      return;
    }

    try {
      const res = await fetch(`/api/teams/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: inviteEmail, role: inviteRole, displayName: nameTrimmed }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Member added successfully.');
        setInviteEmail('');
        setInviteDisplayName('');
        fetchMembers();
      } else {
        toast.error(data.error || 'Failed to add member.');
      }
    } catch (err) {
      toast.error('Error adding member');
    }
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResourceTitle || !newResourceUrl) return;
    try {
      const res = await fetch(`/api/teams/${id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newResourceTitle, url: newResourceUrl }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Resource shared successfully!');
        setNewResourceTitle('');
        setNewResourceUrl('');
        fetchResources();
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error('Failed to share resource');
    }
  };

  const handleAddAgenda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgendaTitle || !newAgendaStart || !newAgendaEnd) return;
    try {
      const res = await fetch(`/api/teams/${id}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'agenda',
          title: newAgendaTitle,
          startDate: new Date(newAgendaStart).toISOString(),
          endDate: new Date(newAgendaEnd).toISOString(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Agenda item added.');
        setNewAgendaTitle('');
        setNewAgendaStart('');
        setNewAgendaEnd('');
        fetchMilestones();
      }
    } catch (err) {
      toast.error('Failed to create agenda');
    }
  };

  const handleDeleteAgenda = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this agenda item?')) return;

    const role = team?.role || 'member';
    const isOwner = team?.isOwner;
    const canDelete = ['team_admin', 'website_admin', 'admin'].includes(role) || isOwner;
    if (!canDelete) {
      toast.error('Forbidden: You do not have permission to delete agenda items.');
      return;
    }

    const originalAgendas = [...agendas];
    setAgendas(prev => prev.filter(item => item.id !== itemId));

    try {
      const res = await fetch(`/api/teams/${id}/milestones/${itemId}?type=agenda`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Agenda item deleted.');
        fetchMilestones();
      } else {
        toast.error(data.error || 'Failed to delete agenda item.');
        setAgendas(originalAgendas);
      }
    } catch (err) {
      toast.error('Failed to delete agenda item.');
      setAgendas(originalAgendas);
    }
  };

  const handleKickMember = async (targetUserId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      const res = await fetch(`/api/teams/${id}/members/${targetUserId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('Member removed.');
        fetchMembers();
        refreshTeamDataBackground();
        fetchAnalytics();
        fetchActivities();
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error('Failed to remove member');
    }
  };

  const handleUpdateSettings = async (updates: any) => {
    try {
      const res = await fetch(`/api/teams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Settings updated.');
        setTeam((prev: any) => ({
          ...prev,
          ...data.team,
          role: prev?.role,
          isOwner: prev?.isOwner,
          memberCount: prev?.memberCount || data.team?.memberCount,
          metrics: prev?.metrics || data.team?.metrics,
        }));
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error('Failed to update settings');
    }
  };

  const handleLeaveTeam = async () => {
    if (!confirm('Are you sure you want to leave this team?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/teams/${id}/members/${session?.user.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('You have left the team.');
        router.push('/dashboard');
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error('Failed to leave team');
    }
  };



  if (loading || !team) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const userRole = team.role || 'member';
  const isAdmin = ['team_admin', 'website_admin', 'admin'].includes(userRole);
  const canDeleteAgendas = isAdmin || team.isOwner;
  const privacySettings = team.settings?.privacy || {};
  const progressMode = privacySettings.progress_visibility || 'members';

  return (
    <main className="relative min-h-screen bg-background overflow-x-hidden flex flex-col justify-between">
      <Toaster position="top-center" theme="dark" />

      {/* 2. PixelBlast Interactive Background Integration */}
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none"
        }}
      >
        <PixelBlast
          variant="square"
          pixelSize={4}
          color="#B497CF"
          patternScale={2}
          patternDensity={1}
          pixelSizeJitter={0}
          enableRipples
          rippleSpeed={0.4}
          rippleThickness={0.12}
          rippleIntensityScale={1.5}
          liquid={false}
          liquidStrength={0.12}
          liquidRadius={1.2}
          liquidWobbleSpeed={5}
          speed={0.5}
          edgeFade={0.25}
          transparent
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">
        {/* Navigation */}
        <Navbar
          onMenuClick={() => setIsSidebarOpen(true)}
          isMenuOpen={isSidebarOpen}
        />
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        {/* 3. Hero Section with Shuffle Animation */}
        <section className="pt-32 pb-10 px-4 md:px-8 max-w-7xl mx-auto w-full text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-bold uppercase tracking-wider mb-4">
            <Sparkles className="h-3.5 w-3.5 animate-spin" />
            Team Dashboard
          </div>
          
          <h1 className={cn("text-4xl md:text-6xl font-extrabold text-white mb-2 leading-none flex justify-center", knightWarrior.className)}>
            <Shuffle
              text={team.name}
              shuffleDirection="right"
              duration={0.35}
              animationMode="evenodd"
              shuffleTimes={1}
              ease="power3.out"
              stagger={0.03}
              threshold={0.1}
              triggerOnce={true}
              triggerOnHover
              respectReducedMotion={true}
              loop={false}
              loopDelay={0}
            />
          </h1>
          <p className="text-white/50 text-sm max-w-lg mx-auto">{team.description || 'Futuristic learning guild'}</p>
        </section>

        {/* 1. Three-Column visual layout grid */}
        <div className="max-w-7xl mx-auto w-full px-4 md:px-8 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
          
          {/* Left Column: Navigation switcher */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="p-4 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md space-y-2">
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold block mb-3 px-2">Navigation</span>
              
              <button
                onClick={() => setActiveTab('overview')}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 cursor-pointer",
                  activeTab === 'overview' ? "bg-purple-600 text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <Target className="h-4 w-4" />
                Overview
              </button>

              <button
                onClick={() => setActiveTab('members')}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 cursor-pointer",
                  activeTab === 'members' ? "bg-purple-600 text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <Users className="h-4 w-4" />
                Members & Roster
              </button>

              <button
                onClick={() => setActiveTab('activity')}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 cursor-pointer",
                  activeTab === 'activity' ? "bg-purple-600 text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <Activity className="h-4 w-4" />
                Activity Feed
              </button>

              <button
                onClick={() => setActiveTab('analytics')}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 cursor-pointer",
                  activeTab === 'analytics' ? "bg-purple-600 text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <BarChart2 className="h-4 w-4" />
                Analytics
              </button>

              <button
                onClick={() => setActiveTab('agenda')}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 cursor-pointer",
                  activeTab === 'agenda' ? "bg-purple-600 text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <Calendar className="h-4 w-4" />
                Agenda Items
              </button>

              <button
                onClick={() => setActiveTab('resources')}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 cursor-pointer",
                  activeTab === 'resources' ? "bg-purple-600 text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <BookOpen className="h-4 w-4" />
                Resources
              </button>

              {isAdmin && (
                <button
                  onClick={() => setActiveTab('settings')}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 cursor-pointer",
                    activeTab === 'settings' ? "bg-purple-600 text-white shadow-lg" : "text-white/60 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </button>
              )}
            </div>

            <div className="p-4 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md space-y-3">
              <span className="text-[10px] text-white/40 uppercase tracking-wider font-bold block px-2">Quick Actions</span>
              <button
                onClick={handleLeaveTeam}
                className="w-full bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/20 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Leave Team
              </button>
            </div>
          </aside>

          {/* Center Column: Dynamic content based on tab switcher */}
          <main className="lg:col-span-6 space-y-6">
            <AnimatePresence mode="wait">
              {activeTab === 'overview' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md">
                    <h2 className="text-lg font-bold text-white mb-2">Team Mission & Goals</h2>
                    <p className="text-white/70 text-xs leading-relaxed">{team.goal || 'No overall team goal defined yet.'}</p>
                  </div>

                  <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md space-y-4">
                    <h2 className="text-lg font-bold text-white">Challenges</h2>
                    {challenges.length === 0 ? (
                      <p className="text-white/40 text-xs">No active challenges right now.</p>
                    ) : (
                      <div className="space-y-3">
                        {challenges.map((c) => (
                          <div key={c.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <h4 className="text-xs font-bold text-white">{c.title}</h4>
                            <p className="text-[10px] text-white/50 mt-1">{c.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'members' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-lg font-bold text-white">Members Roster</h2>
                      <span className="text-xs text-white/50">{members.length} Total</span>
                    </div>

                    <div className="space-y-3">
                      {membersError ? (
                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                          <span>{membersError}</span>
                        </div>
                      ) : membersLoading ? (
                        <div className="space-y-3">
                          <div className="h-14 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                          <div className="h-14 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                          <div className="h-14 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                        </div>
                      ) : members.length === 0 ? (
                        <p className="text-white/40 text-xs text-center py-4">No members found.</p>
                      ) : (
                        members.map((member) => {
                          console.log("MEMBER OBJECT", member);
                          const status = member.presenceStatus || 'offline';
                          const resolvedName =
                            member.display_name?.trim() ||
                            member.profile?.name?.trim() ||
                            member.profiles?.name?.trim() ||
                            member.name?.trim() ||
                            "Unknown User";
                          return (
                            <div
                              key={member.user_id}
                              className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between gap-4"
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative">
                                    <div className="h-8 w-8 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs">
                                      {(() => {
                                        const isElevated = ['mentor', 'team_admin', 'website_admin', 'admin'].includes(member.role) || member.user_id === team.owner_id;
                                        const isObfuscated = !isElevated && (progressMode === 'cryptic' || progressMode === 'anonymous');
                                        return isObfuscated ? '👤' : (resolvedName[0]?.toUpperCase() || 'U');
                                      })()}
                                    </div>
                                  <span className={cn(
                                    "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-black",
                                    status === 'online' ? "bg-emerald-500" :
                                    status === 'recently_active' ? "bg-amber-500" : "bg-white/20"
                                  )} />
                                </div>

                                <div>
                                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                    {(() => {
                                      const isElevated = ['mentor', 'team_admin', 'website_admin', 'admin'].includes(member.role) || member.user_id === team.owner_id;
                                      const isObfuscated = !isElevated && (progressMode === 'cryptic' || progressMode === 'anonymous');
                                      return isObfuscated ? (
                                        <CrypticText
                                          text={resolvedName}
                                          mode={progressMode}
                                          userRole={userRole}
                                        />
                                      ) : (
                                        <span>{resolvedName}</span>
                                      );
                                    })()}
                                    <span className="text-[9px] uppercase font-bold px-1 py-0.5 rounded bg-white/5 border border-white/10 text-white/40">
                                      {member.role}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-white/40 mt-0.5">Joined {new Date(member.joined_at).toLocaleDateString()}</p>
                                </div>
                              </div>

                              {/* Show streaks */}
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <span className="text-[10px] text-white/40 block">Streak</span>
                                  <strong className="text-purple-400 text-xs">{member.current_streak} days</strong>
                                </div>

                                {isAdmin && member.user_id !== team.owner_id && (
                                  <button
                                    onClick={() => handleKickMember(member.user_id)}
                                    className="p-1 rounded hover:bg-rose-500/10 text-white/40 hover:text-rose-400 transition-all cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'activity' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md">
                    <h2 className="text-lg font-bold text-white mb-6">Activity Feed</h2>

                    <div className="space-y-4">
                      {activitiesError ? (
                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                          <span>{activitiesError}</span>
                        </div>
                      ) : activitiesLoading ? (
                        <div className="space-y-3">
                          <div className="h-10 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                          <div className="h-10 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                          <div className="h-10 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                        </div>
                      ) : activities.length === 0 ? (
                        <p className="text-white/40 text-xs">No activity logged.</p>
                      ) : (
                        activities.map((act) => {
                          const actorMember = members.find(m => m.user_id === act.actor_id);
                          const actorRole = actorMember ? actorMember.role : 'member';
                          const isActorElevated = ['mentor', 'team_admin', 'website_admin', 'admin'].includes(actorRole) || act.actor_id === team.owner_id;
                          const isActorObfuscated = !isActorElevated && (progressMode === 'cryptic' || progressMode === 'anonymous');

                          return (
                            <div key={act.id} className="flex gap-3 text-xs">
                              <Activity className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-white/70">
                                  <span className="font-bold text-white">
                                    <CrypticText
                                      text={(() => {
                                        const actorMember = members.find(m => m.user_id === act.actor_id);
                                        const memberData = actorMember || act.profiles || act;
                                        const resolvedName =
                                          memberData.display_name?.trim() ||
                                          memberData.profile?.name?.trim() ||
                                          memberData.profiles?.name?.trim() ||
                                          memberData.name?.trim() ||
                                          'Unknown User';
                                        return resolvedName;
                                      })()}
                                      mode={isActorObfuscated ? progressMode : 'exact'}
                                      userRole={userRole}
                                    />
                                  </span>{' '}
                                  {act.activity_type === 'joined_team' ? 'joined the team' :
                                   act.activity_type === 'resource_added' ? 'shared a link resource' :
                                   act.activity_type === 'agenda_updated' ? 'updated team agenda' : 'performed an action'}
                                </p>
                                <span className="text-[10px] text-white/30 block mt-0.5">
                                  {new Date(act.created_at).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'analytics' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md space-y-4">
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-bold text-white">Metrics Overview</h2>
                      
                      {/* Export Actions Trigger */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => { setExportFormat('xlsx'); setTriggerExport(true); }}
                          className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-[10px] cursor-pointer"
                        >
                          <FileSpreadsheet className="h-3 w-3 mr-1" />
                          Excel
                        </Button>
                      </div>
                    </div>

                    {analyticsError ? (
                      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                        <span>{analyticsError}</span>
                      </div>
                    ) : analyticsLoading ? (
                      <div className="h-20 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                    ) : (
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                          <span className="text-[10px] text-white/40 uppercase block">Participation</span>
                          <strong className="text-xl text-purple-400 block mt-1">{analytics?.participationRate || 100}%</strong>
                        </div>
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                          <span className="text-[10px] text-white/40 uppercase block">Active Members</span>
                          <strong className="text-xl text-emerald-400 block mt-1">{analytics?.activeMembers || 1} online</strong>
                        </div>
                      </div>
                    )}

                    {/* Export Status Card Loader Container */}
                    <div className="pt-4 flex justify-center">
                      <ExportStatusCard
                        teamId={id}
                        triggerExportSignal={triggerExport}
                        format={exportFormat}
                        onResetSignal={() => setTriggerExport(false)}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'agenda' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {isAdmin && (
                    <form onSubmit={handleAddAgenda} className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md space-y-4">
                      <h2 className="text-lg font-bold text-white">Create Agenda Item</h2>
                      
                      <div className="space-y-3">
                        <input
                          type="text"
                          placeholder="Agenda Title"
                          value={newAgendaTitle}
                          onChange={(e) => setNewAgendaTitle(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="datetime-local"
                            value={newAgendaStart}
                            onChange={(e) => setNewAgendaStart(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none"
                          />
                          <input
                            type="datetime-local"
                            value={newAgendaEnd}
                            onChange={(e) => setNewAgendaEnd(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>
                      </div>

                      <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white text-xs border-0 cursor-pointer">
                        Add Agenda
                      </Button>
                    </form>
                  )}

                  <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md">
                    <h2 className="text-lg font-bold text-white mb-6">Upcoming Agenda Events</h2>
                    {milestonesLoading ? (
                      <div className="space-y-3">
                        <div className="h-12 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                        <div className="h-12 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                      </div>
                    ) : agendas.length === 0 ? (
                      <p className="text-white/40 text-xs">No agenda items scheduled.</p>
                    ) : (
                      <div className="space-y-4">
                        {agendas.map((item) => (
                          <div key={item.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between">
                            <div>
                              <h4 className="text-xs font-bold text-white">{item.title}</h4>
                              <span className="text-[10px] text-white/40 mt-1 block">
                                {new Date(item.start_date).toLocaleString()} - {new Date(item.end_date).toLocaleTimeString()}
                              </span>
                            </div>
                            {canDeleteAgendas && (
                              <button
                                onClick={() => handleDeleteAgenda(item.id)}
                                className="p-1 rounded hover:bg-rose-500/10 text-white/40 hover:text-rose-400 transition-all cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'resources' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <form onSubmit={handleAddResource} className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md space-y-4">
                    <h2 className="text-lg font-bold text-white">Share Link Resource</h2>
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Resource Title"
                        value={newResourceTitle}
                        onChange={(e) => setNewResourceTitle(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                      <input
                        type="url"
                        placeholder="URL (https://...)"
                        value={newResourceUrl}
                        onChange={(e) => setNewResourceUrl(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white text-xs border-0 cursor-pointer">
                      Share Resource
                    </Button>
                  </form>

                  <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md">
                    <h2 className="text-lg font-bold text-white mb-6">Shared Links</h2>
                    {resourcesError ? (
                      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
                        <span>{resourcesError}</span>
                      </div>
                    ) : resourcesLoading ? (
                      <div className="space-y-3">
                        <div className="h-12 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                        <div className="h-12 bg-white/[0.02] border border-white/[0.04] rounded-xl animate-pulse" />
                      </div>
                    ) : resources.length === 0 ? (
                      <p className="text-white/40 text-xs">No resources shared yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {resources.map((res) => {
                          const contributorMember = members.find(m => m.user_id === res.created_by);
                          const contributorRole = contributorMember ? contributorMember.role : 'member';
                          const isContributorElevated = ['mentor', 'team_admin', 'website_admin', 'admin'].includes(contributorRole) || res.created_by === team.owner_id;
                          const isContributorObfuscated = !isContributorElevated && (progressMode === 'cryptic' || progressMode === 'anonymous');

                          return (
                            <div key={res.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between gap-4">
                              <div>
                                <h4 className="text-xs font-bold text-white">{res.title}</h4>
                                <a href={res.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-400 hover:underline mt-1 block">
                                  {res.url}
                                </a>
                              </div>
                              <span className="text-[9px] text-white/30 shrink-0 flex items-center gap-1">
                                Shared by{' '}
                                <CrypticText
                                  text={(() => {
                                    const contributorMember = members.find(m => m.user_id === res.created_by);
                                    const memberData = contributorMember || res.profiles || res;
                                    const resolvedName =
                                      memberData.display_name?.trim() ||
                                      memberData.profile?.name?.trim() ||
                                      memberData.profiles?.name?.trim() ||
                                      memberData.name?.trim() ||
                                      'Unknown User';
                                    return resolvedName;
                                  })()}
                                  mode={isContributorObfuscated ? progressMode : 'exact'}
                                  userRole={userRole}
                                  className="text-[9px] text-white/30"
                                />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'settings' && isAdmin && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="p-6 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md space-y-4">
                    <h2 className="text-lg font-bold text-white">Privacy Controls</h2>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center gap-4 text-xs">
                        <div>
                          <span className="text-white font-medium block">Leaderboard Privacy</span>
                          <span className="text-white/40 text-[10px] mt-0.5 block">Controls names visibility on leaderboards</span>
                        </div>
                        <select
                          value={privacySettings.leaderboard_visibility || 'exact'}
                          onChange={(e) => handleUpdateSettings({
                            settings: {
                              ...team.settings,
                              privacy: {
                                ...privacySettings,
                                leaderboard_visibility: e.target.value,
                              }
                            }
                          })}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-white"
                        >
                          <option value="exact" className="bg-zinc-950 text-white">Exact (Show names)</option>
                          <option value="anonymous" className="bg-zinc-950 text-white">Anonymous (Mask names)</option>
                          <option value="disabled" className="bg-zinc-950 text-white">Disabled (Hide board)</option>
                        </select>
                      </div>

                      <div className="flex justify-between items-center gap-4 text-xs">
                        <div>
                          <span className="text-white font-medium block">Progress Anonymization</span>
                          <span className="text-white/40 text-[10px] mt-0.5 block">Swaps metrics display mode</span>
                        </div>
                        <select
                          value={privacySettings.progress_visibility || 'members'}
                          onChange={(e) => handleUpdateSettings({
                            settings: {
                              ...team.settings,
                              privacy: {
                                ...privacySettings,
                                progress_visibility: e.target.value,
                              }
                            }
                          })}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-white"
                        >
                          <option value="members" className="bg-zinc-950 text-white">Standard Names</option>
                          <option value="cryptic" className="bg-zinc-950 text-white">Cryptic (Ancient Glyph Swaps)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Right Column: Member list & active users status sidebar */}
          <aside className="lg:col-span-3 space-y-6">
            <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md">
              <h3 className="text-white font-bold text-xs mb-4 flex items-center gap-1.5">
                <Users className="h-4 w-4 text-purple-400" />
                Active Members
              </h3>
              
              <div className="space-y-3">
                {members.slice(0, 8).map((m) => {
                  const status = getMemberPresenceStatus(m);
                  const resolvedName =
                    m.display_name?.trim() ||
                    m.profile?.name?.trim() ||
                    m.profiles?.name?.trim() ||
                    m.name?.trim() ||
                    "Unknown User";
                  return (
                    <div key={m.user_id} className="flex items-center justify-between gap-3 text-xs w-full">
                      <div className="flex items-center gap-2 max-w-[160px] truncate">
                        <span className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          status === 'online' ? "bg-emerald-500 animate-pulse" :
                          status === 'recently_active' ? "bg-amber-500" : "bg-white/20"
                        )} />
                        {(() => {
                          const isElevated = ['mentor', 'team_admin', 'website_admin', 'admin'].includes(m.role) || m.user_id === team.owner_id;
                          const isObfuscated = !isElevated && (progressMode === 'cryptic' || progressMode === 'anonymous');
                          return isObfuscated ? (
                            <CrypticText
                              text={resolvedName}
                              mode={progressMode}
                              userRole={userRole}
                              className="text-white/70 text-xs"
                            />
                          ) : (
                            <span className="text-white/70 text-xs">{resolvedName}</span>
                          );
                        })()}
                      </div>
                      <span className="text-[9px] uppercase font-bold text-white/30 shrink-0">{status}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Invite Form Widget */}
            {isAdmin && (
              <div className="p-5 rounded-2xl border border-white/[0.06] bg-black/40 backdrop-blur-md space-y-4">
                <h3 className="text-white font-bold text-xs">Invite Member</h3>
                <form onSubmit={handleInvite} className="space-y-3">
                  <input
                    type="email"
                    placeholder="member@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                  <input
                    type="text"
                    placeholder="Display Name in Team"
                    value={inviteDisplayName}
                    onChange={(e) => setInviteDisplayName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                    required
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white"
                  >
                    <option value="member" className="bg-zinc-950 text-white">Member</option>
                    <option value="mentor" className="bg-zinc-950 text-white">Mentor</option>
                    <option value="team_admin" className="bg-zinc-950 text-white">Admin</option>
                  </select>
                  <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-xs border-0 cursor-pointer py-1.5 h-8">
                    Send Invite
                  </Button>
                </form>
              </div>
            )}
          </aside>

        </div>
      </div>
      <Footer />
    </main>
  );
}
