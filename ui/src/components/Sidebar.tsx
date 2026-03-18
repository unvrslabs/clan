import { useRef, useState } from "react";
import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Settings,
  Plus,
  ChevronDown,
  Check,
  BookOpen,
  Sun,
  Moon,
  Clock3,
  Puzzle,
  Image,
  TrendingUp,
  Bot,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NavLink } from "@/lib/router";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { CompanyPatternIcon } from "./CompanyPatternIcon";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { useSidebar } from "../context/SidebarContext";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { pluginsApi } from "@/api/plugins";
import { Link, useNavigate, useLocation } from "@/lib/router";
import { useTheme } from "../context/ThemeContext";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";

export function Sidebar() {
  const { openNewIssue, openOnboarding } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const { companies, selectedCompanyId, selectedCompany, setSelectedCompanyId } = useCompany();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const companyMenuRef = useRef<HTMLDivElement>(null);
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;
  const { data: installedPlugins } = useQuery({
    queryKey: queryKeys.plugins.all,
    queryFn: () => pluginsApi.list(),
  });

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  const sidebarCompanies = companies.filter((c) => c.status !== "archived");

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="w-60 h-full min-h-0 bg-sidebar flex flex-col rounded-2xl border border-border/50 glass-surface overflow-hidden">
      {/* Search bar at top */}
      <div className="px-3 pt-4 pb-2 shrink-0">
        <button
          onClick={openSearch}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-muted-foreground/60 hover:bg-accent/50 hover:text-muted-foreground transition-colors"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span>Search</span>
        </button>
      </div>

      <div className="mx-3 border-t border-border/50 shrink-0" />

      {/* Main navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-5 px-3 py-3">
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} liveCount={liveRunCount} />
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
          <button
            onClick={() => openNewIssue()}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium text-foreground/70 hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span className="truncate">New Issue</span>
          </button>
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
        </div>

        <SidebarSection label="Work">
          <SidebarNavItem to="/issues" label="Issues" icon={CircleDot} />
          <SidebarNavItem to="/goals" label="Goals" icon={Target} />
        </SidebarSection>

        <SidebarSection label="Automation">
          <SidebarNavItem to="/publications" label="Social" icon={Image} />
          <SidebarNavItem to="/polymarket" label="Polymarket" icon={TrendingUp} />
        </SidebarSection>

        <SidebarProjects />

        <SidebarAgents />

        <SidebarSection label="Company">
          <SidebarNavItem to="/org" label="Org" icon={Network} />
          <SidebarNavItem to="/costs" label="Costs" icon={DollarSign} />
          <SidebarNavItem to="/activity" label="Activity" icon={History} />
          <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />
        </SidebarSection>

        <SidebarSection label="Instance">
          <SidebarNavItem to="/instance/settings/heartbeats" label="Heartbeats" icon={Clock3} end />
          <SidebarNavItem to="/instance/settings/plugins" label="Plugins" icon={Puzzle} />
          {(installedPlugins ?? []).length > 0 && (
            <div className="ml-7 flex flex-col gap-0.5 border-l border-border/50 pl-3">
              {(installedPlugins ?? []).map((plugin) => (
                <NavLink
                  key={plugin.id}
                  to={`/instance/settings/plugins/${plugin.id}`}
                  onClick={() => { if (isMobile) setSidebarOpen(false); }}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-2 py-1.5 text-xs font-medium transition-colors truncate",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )
                  }
                >
                  {plugin.manifestJson.displayName ?? plugin.packageName}
                </NavLink>
              ))}
            </div>
          )}
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>

      {/* Footer */}
      <div className="shrink-0 px-3 pb-2">
        {/* Company selector at bottom */}
        <div className="border-t border-border/50 pt-2">
          <div className="relative" ref={companyMenuRef}>
            <button
              onClick={() => setCompanyMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 w-full px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors"
            >
              <CompanyPatternIcon
                companyName={selectedCompany?.name ?? "?"}
                brandColor={selectedCompany?.brandColor}
                className="w-8 h-8 rounded-lg text-xs shrink-0"
              />
              <span className="text-sm font-medium text-foreground truncate flex-1 text-left">
                {selectedCompany?.name ?? "Select company"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>

            {companyMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-50"
                  onClick={() => setCompanyMenuOpen(false)}
                  aria-label="Close menu"
                />
                <div className="absolute left-0 bottom-full mb-1 z-50 w-52 rounded-xl border border-border bg-popover p-1 shadow-lg glass-overlay">
                  {sidebarCompanies.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => {
                        setSelectedCompanyId(company.id);
                        setCompanyMenuOpen(false);
                        const suffix = location.pathname.replace(/^\/[^/]+/, "");
                        navigate(`/${company.issuePrefix}${suffix}`);
                      }}
                      className={cn(
                        "flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/50",
                        company.id === selectedCompanyId && "bg-accent/30"
                      )}
                    >
                      <CompanyPatternIcon
                        companyName={company.name}
                        brandColor={company.brandColor}
                        className="w-6 h-6 rounded-md text-[10px] shrink-0"
                      />
                      <span className="truncate flex-1 text-left">{company.name}</span>
                      {company.id === selectedCompanyId && (
                        <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
                      )}
                    </button>
                  ))}
                  <div className="border-t border-border/50 mt-1 pt-1">
                    <button
                      onClick={() => { openOnboarding(); setCompanyMenuOpen(false); }}
                      className="flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>Add company</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
