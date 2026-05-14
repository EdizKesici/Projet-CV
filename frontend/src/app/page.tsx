'use client';

import { useState } from 'react';
import { Sidebar, MobileNav } from '@/components/luxtalent/sidebar';
import { RHDashboard } from '@/components/luxtalent/rh-dashboard';
import { TechDashboard } from '@/components/luxtalent/tech-dashboard';
import { BatchProcessor } from '@/components/luxtalent/batch-processor';
import { FairnessAudit } from '@/components/luxtalent/fairness-audit';
import { ScreeningLog } from '@/components/luxtalent/screening-log';
import { AdvancedLogs } from '@/components/luxtalent/advanced-logs';
import { ProcessedFiles } from '@/components/luxtalent/processed-files';
import { Configuration } from '@/components/luxtalent/configuration';
import type { SectionId, SectionGroup } from '@/lib/types';

function getGroup(section: SectionId): SectionGroup {
  const rhSections: SectionId[] = ['rh-dashboard', 'batch-processor', 'screening-log'];
  return rhSections.includes(section) ? 'rh' : 'tech';
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<SectionId>('rh-dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const activeGroup = getGroup(activeSection);

  const renderSection = () => {
    switch (activeSection) {
      case 'rh-dashboard':
        return <RHDashboard onNavigate={setActiveSection} />;
      case 'batch-processor':
        return <BatchProcessor />;
      case 'screening-log':
        return <ScreeningLog />;
      case 'tech-dashboard':
        return <TechDashboard onNavigate={setActiveSection} />;
      case 'fairness-audit':
        return <FairnessAudit />;
      case 'advanced-logs':
        return <AdvancedLogs />;
      case 'processed-files':
        return <ProcessedFiles />;
      case 'configuration':
        return <Configuration />;
      default:
        return <RHDashboard onNavigate={setActiveSection} />;
    }
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {/* Top bar on mobile */}
        <div className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
            activeGroup === 'rh' ? 'bg-emerald-500' : 'bg-blue-500'
          }`}>
            <span className="text-white font-bold text-xs">LT</span>
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm text-slate-800 truncate">LuxTalent Advisory</h1>
            <p className="text-[10px] text-slate-400 truncate">
              {activeGroup === 'rh' ? 'Section RH' : 'Section Technique'} — V2
            </p>
          </div>
        </div>

        <div className="p-4 md:p-8 max-w-6xl">
          {renderSection()}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <MobileNav activeSection={activeSection} onSectionChange={setActiveSection} />
    </div>
  );
}
