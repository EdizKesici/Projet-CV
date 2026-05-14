'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  FolderUp,
  ClipboardList,
  Scale,
  Settings,
  ChevronLeft,
  Menu,
  Cpu,
  Users,
  FolderOpen,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { SectionGroup, SectionId } from '@/lib/types';

interface SidebarProps {
  activeSection: SectionId;
  onSectionChange: (section: SectionId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  group: SectionGroup;
}

const NAV_ITEMS: NavItem[] = [
  // RH Section
  { id: 'rh-dashboard', label: 'Tableau de bord', icon: LayoutDashboard, group: 'rh' },
  { id: 'batch-processor', label: 'Dépôt de CV', icon: FolderUp, group: 'rh' },
  { id: 'screening-log', label: 'Historique', icon: ClipboardList, group: 'rh' },
  // Technical Section
  { id: 'tech-dashboard', label: 'Tableau de bord', icon: Cpu, group: 'tech' },
  { id: 'fairness-audit', label: 'Audit & Métriques', icon: Scale, group: 'tech' },
  { id: 'advanced-logs', label: 'Logs Avancés', icon: FileText, group: 'tech' },
  { id: 'processed-files', label: 'Fichiers Traités', icon: FolderOpen, group: 'tech' },
  { id: 'configuration', label: 'Configuration', icon: Settings, group: 'tech' },
];

const GROUP_LABELS: Record<SectionGroup, string> = {
  rh: 'Ressources Humaines',
  tech: 'Technique',
};

const GROUP_ICONS: Record<SectionGroup, React.ElementType> = {
  rh: Users,
  tech: Cpu,
};

const GROUP_COLORS: Record<SectionGroup, { active: string; bg: string; icon: string; badge: string; border: string }> = {
  rh: {
    active: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30',
    bg: 'bg-emerald-500',
    icon: 'text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    border: 'border-emerald-500/20',
  },
  tech: {
    active: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
    bg: 'bg-blue-500',
    icon: 'text-blue-400',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    border: 'border-blue-500/20',
  },
};

function getGroup(section: SectionId): SectionGroup {
  const item = NAV_ITEMS.find((i) => i.id === section);
  return item?.group ?? 'rh';
}

export function Sidebar({ activeSection, onSectionChange, collapsed, onToggleCollapse }: SidebarProps) {
  const activeGroup = getGroup(activeSection);
  const rhItems = NAV_ITEMS.filter((i) => i.group === 'rh');
  const techItems = NAV_ITEMS.filter((i) => i.group === 'tech');

  const renderGroup = (group: SectionGroup, items: NavItem[]) => {
    const colors = GROUP_COLORS[group];
    const GroupIcon = GROUP_ICONS[group];
    const isActiveGroup = activeGroup === group;

    return (
      <div key={group}>
        {/* Group Header */}
        {!collapsed ? (
          <div className={`flex items-center gap-2 px-3 py-2 mb-1 rounded-lg ${colors.badge} border ${colors.border}`}>
            <GroupIcon className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider truncate">
              {GROUP_LABELS[group]}
            </span>
            {isActiveGroup && (
              <div className={`ml-auto w-1.5 h-1.5 rounded-full ${colors.bg} animate-pulse`} />
            )}
          </div>
        ) : (
          <div className={`flex justify-center mb-1`}>
            <div className={`w-1 h-1 rounded-full ${isActiveGroup ? colors.bg : 'bg-slate-600'}`} />
          </div>
        )}

        {/* Group Items */}
        <div className="space-y-0.5">
          {items.map((item) => {
            const isActive = activeSection === item.id;
            const Icon = item.icon;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onSectionChange(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium border ${
                      isActive
                        ? colors.active
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white border-transparent'
                    }`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? colors.icon : 'text-slate-400'}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" className="bg-slate-800 text-white border-slate-700">
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-64'
        } h-screen bg-slate-900 text-white flex flex-col transition-all duration-300 relative flex-shrink-0`}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">LT</span>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="font-bold text-sm truncate">LuxTalent Advisory</h1>
                <p className="text-[11px] text-slate-400 truncate">Pré-sélection CV — V2</p>
              </div>
            )}
          </div>
        </div>

        {/* Toggle button */}
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-16 w-6 h-6 bg-slate-700 border border-slate-600 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-600 transition-colors z-10 hidden md:flex"
        >
          {collapsed ? <Menu className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-4 overflow-y-auto">
          {renderGroup('rh', rhItems)}
          {renderGroup('tech', techItems)}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-4 border-t border-slate-700/50">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className={`w-2 h-2 ${GROUP_COLORS[activeGroup].bg} rounded-full`} />
              <span>Section {activeGroup === 'rh' ? 'RH' : 'Technique'} active</span>
            </div>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

// Mobile bottom nav with sheet for additional items
export function MobileNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: SectionId;
  onSectionChange: (section: SectionId) => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleNav = (section: SectionId) => {
    onSectionChange(section);
    setSheetOpen(false);
  };

  const activeGroup = getGroup(activeSection);
  const mainItems = NAV_ITEMS.filter((i) => i.group === 'rh');
  const moreItems = NAV_ITEMS.filter((i) => i.group === 'tech');
  const isMoreActive = moreItems.some((i) => i.id === activeSection);

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 z-50 safe-area-bottom">
        <div className="flex justify-around items-center py-2 px-1">
          {mainItems.map((item) => {
            const isActive = activeSection === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-0 ${
                  isActive ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] truncate max-w-[60px]">
                  {item.id === 'rh-dashboard' ? 'Accueil' : item.label.split(' ').slice(-1)[0]}
                </span>
              </button>
            );
          })}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
                  isMoreActive ? 'text-blue-400' : 'text-slate-400'
                }`}
              >
                <Cpu className="w-5 h-5" />
                <span className="text-[10px]">Tech</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-slate-900 border-slate-700 text-white rounded-t-2xl">
              <SheetHeader className="pb-4">
                <SheetTitle className="text-white text-left">Section Technique</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-3 pb-6">
                {moreItems.map((item) => {
                  const isActive = activeSection === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNav(item.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-colors ${
                        isActive
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-300 border border-transparent hover:bg-slate-700'
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="text-xs font-medium text-center">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
