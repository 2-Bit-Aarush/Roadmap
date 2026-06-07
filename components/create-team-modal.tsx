"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Shield, Trophy, BookOpen, Code, Star, Sparkles, Loader2 } from 'lucide-react';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newTeam: any) => void;
}

const ICONS = [
  { name: 'Shield', Icon: Shield },
  { name: 'Trophy', Icon: Trophy },
  { name: 'BookOpen', Icon: BookOpen },
  { name: 'Code', Icon: Code },
  { name: 'Star', Icon: Star },
];

export function CreateTeamModal({ isOpen, onClose, onSuccess }: CreateTeamModalProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [icon, setIcon] = useState('Shield');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'invite_only'>('public');
  const [memberLimit, setMemberLimit] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Team name is required');
      return;
    }

    if (trimmedName.length < 3 || trimmedName.length > 50) {
      toast.error('Team name must be between 3 and 50 characters');
      return;
    }

    if (description.trim().length > 300) {
      toast.error('Description cannot exceed 300 characters');
      return;
    }

    if (goal.trim().length > 150) {
      toast.error('Goal cannot exceed 150 characters');
      return;
    }

    setLoading(true);
    try {
      const parsedLimit = memberLimit.trim() ? parseInt(memberLimit, 10) : null;
      if (parsedLimit !== null && (isNaN(parsedLimit) || parsedLimit <= 0)) {
        toast.error('Member limit must be a positive number');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim(),
          icon,
          goal: goal.trim(),
          visibility,
          memberLimit: parsedLimit,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create team');
      }

      toast.success('Team created successfully!');
      
      // Reset form fields
      setName('');
      setDescription('');
      setGoal('');
      setIcon('Shield');
      setVisibility('public');
      setMemberLimit('');
      
      onClose();
      if (onSuccess) {
        onSuccess(data.team);
      } else {
        router.push(`/teams/${data.team.id}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px] bg-zinc-950/95 border-zinc-800 text-white backdrop-blur-xl shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5 text-purple-400" />
            Create Collaborative Team
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            Set up a team space to coordinate progress, share resources, and complete milestones together.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Team Name *</label>
              <span className={`text-[10px] transition-colors ${
                name.length > 0 && name.trim().length < 3 
                  ? 'text-rose-400 font-semibold' 
                  : name.length >= 45 
                    ? 'text-amber-400 font-semibold' 
                    : 'text-zinc-500'
              }`}>
                {name.length}/50 {name.length > 0 && name.trim().length < 3 && '(Min 3)'}
              </span>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 50))}
              placeholder="e.g. Frontend Pioneers"
              className={`bg-zinc-900/50 border-zinc-800 focus:border-purple-500/50 text-white placeholder-zinc-500 h-10 transition-colors ${
                name.length > 0 && name.trim().length < 3 ? 'border-rose-900 focus:border-rose-500/50' : ''
              }`}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Description</label>
              <span className={`text-[10px] transition-colors ${
                description.length >= 280 ? 'text-amber-400 font-semibold' : 'text-zinc-500'
              }`}>
                {description.length}/300
              </span>
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 300))}
              placeholder="What is the focus of this team?"
              className="bg-zinc-900/50 border-zinc-800 focus:border-purple-500/50 text-white placeholder-zinc-500 min-h-[70px]"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Primary Learning Goal</label>
              <span className={`text-[10px] transition-colors ${
                goal.length >= 135 ? 'text-amber-400 font-semibold' : 'text-zinc-500'
              }`}>
                {goal.length}/150
              </span>
            </div>
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value.slice(0, 150))}
              placeholder="e.g. Master React & System Design"
              className="bg-zinc-900/50 border-zinc-800 focus:border-purple-500/50 text-white placeholder-zinc-500 h-10"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Visibility</label>
              <Select
                value={visibility}
                onValueChange={(val: any) => setVisibility(val)}
                disabled={loading}
              >
                <SelectTrigger className="bg-zinc-900/50 border-zinc-800 text-white h-10 w-full focus:ring-0">
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="invite_only">Invite Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Member Limit</label>
              <Input
                type="number"
                value={memberLimit}
                onChange={(e) => setMemberLimit(e.target.value)}
                placeholder="No limit"
                className="bg-zinc-900/50 border-zinc-800 focus:border-purple-500/50 text-white placeholder-zinc-500 h-10"
                min="1"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Choose Badge Icon</label>
            <div className="flex gap-2.5">
              {ICONS.map(({ name: itemIconName, Icon }) => (
                <button
                  key={itemIconName}
                  type="button"
                  onClick={() => setIcon(itemIconName)}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                    icon === itemIconName
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                  disabled={loading}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-4 gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-zinc-400 hover:text-white hover:bg-zinc-900 border-0 cursor-pointer"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 text-white border-0 cursor-pointer flex items-center gap-2 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || name.trim().length < 3 || name.length > 50 || description.length > 300 || goal.length > 150}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Team
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
