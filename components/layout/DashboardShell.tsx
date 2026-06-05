'use client';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import { useDashboardStore } from '@/lib/store';
import EvidenceDrawer from '@/components/ui/EvidenceDrawer';
import TesterPanel from '@/components/ui/TesterPanel';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const loadMockData = useDashboardStore((s) => s.loadMockData);
  const isLoaded = useDashboardStore((s) => s.isLoaded);

  useEffect(() => {
    if (!isLoaded) loadMockData();
  }, [isLoaded, loadMockData]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-[220px] min-h-screen overflow-y-auto">
        {children}
      </main>
      <EvidenceDrawer />
      <TesterPanel />
    </div>
  );
}
