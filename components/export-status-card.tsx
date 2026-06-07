"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, Download, AlertCircle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ExportStatusCardProps {
  teamId: string;
  triggerExportSignal: boolean;
  format: 'xlsx' | 'csv';
  onResetSignal: () => void;
}

export function ExportStatusCard({ teamId, triggerExportSignal, format, onResetSignal }: ExportStatusCardProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [previousJobs, setPreviousJobs] = useState<any[]>([]);

  // 1. Fetch previous jobs on mount
  useEffect(() => {
    fetchPreviousJobs();
  }, [teamId]);

  const fetchPreviousJobs = async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}/export/jobs`);
      const data = await res.json();
      if (data.success) {
        setPreviousJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Error loading previous jobs:', err);
    }
  };

  // 2. Trigger new export job
  useEffect(() => {
    if (!triggerExportSignal) return;

    const startExport = async () => {
      setStatus('queued');
      setDownloadUrl(null);
      setRowCount(null);

      try {
        const res = await fetch(`/api/teams/${teamId}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format }),
        });
        const data = await res.json();
        
        if (data.success && data.job) {
          setActiveJobId(data.job.id);
          setStatus(data.job.status);
          toast.info('Export queued successfully.');
        } else {
          setStatus('failed');
          toast.error(data.error || 'Failed to start export');
        }
      } catch (err) {
        setStatus('failed');
        toast.error('Failed to trigger export.');
      } finally {
        onResetSignal();
      }
    };

    startExport();
  }, [triggerExportSignal]);

  // 3. Status polling loop
  useEffect(() => {
    if (!activeJobId || !['queued', 'processing'].includes(status || '')) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/export/jobs/${activeJobId}`);
        const data = await res.json();

        if (data.success && data.job) {
          setStatus(data.job.status);
          if (data.job.status === 'completed') {
            setDownloadUrl(data.job.downloadUrl);
            setRowCount(data.job.row_count);
            toast.success('Excel export is ready for download!');
            fetchPreviousJobs();
            clearInterval(interval);
          } else if (data.job.status === 'failed') {
            toast.error('Export compilation failed.');
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobId, status]);

  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/export/jobs/${activeJobId}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatus('cancelled');
        setActiveJobId(null);
        toast.info('Export cancelled.');
      }
    } catch (err) {
      toast.error('Failed to cancel export.');
    }
  };

  const handleRetry = () => {
    setStatus('queued');
    setActiveJobId(null);
    onResetSignal();
  };

  if (!status) return null;

  return (
    <div className="p-5 rounded-2xl border border-white/[0.08] bg-black/60 backdrop-blur-xl shadow-2xl max-w-sm w-full space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-white font-bold text-sm">Team Data Export</h4>
          <p className="text-white/40 text-[11px] mt-0.5">Server-side compiler pipeline</p>
        </div>
        
        {activeJobId && ['queued', 'processing'].includes(status) && (
          <button
            onClick={handleCancel}
            className="text-white/40 hover:text-rose-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
          >
            <XCircle className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress States */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {['queued', 'processing'].includes(status) ? (
            <Loader2 className="h-5 w-5 text-purple-400 animate-spin shrink-0" />
          ) : status === 'completed' ? (
            <Download className="h-5 w-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
          )}
          
          <div>
            <span className="text-xs text-white font-medium capitalize">
              {status === 'queued' ? 'Generating export...' :
               status === 'processing' ? 'Preparing analytics...' :
               status === 'completed' ? 'Download Ready' :
               status === 'cancelled' ? 'Export Cancelled' : 'Export Failed'}
            </span>
            <p className="text-[10px] text-white/40 mt-0.5">
              {status === 'queued' ? 'Position in queue: 1' :
               status === 'processing' ? 'Aggregating records...' :
               status === 'completed' ? `Size: ${rowCount} rows` : 'Compilation terminated'}
            </p>
          </div>
        </div>

        {status === 'completed' && downloadUrl && (
          <a
            href={downloadUrl}
            download
            className="p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-all text-xs flex items-center gap-1 cursor-pointer"
          >
            Get File
          </a>
        )}

        {['failed', 'cancelled'].includes(status) && (
          <button
            onClick={handleRetry}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-all text-xs flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
