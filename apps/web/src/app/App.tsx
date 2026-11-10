import { BarChart3, FileText, FolderGit2, GitPullRequest, Moon, Settings, Sun, Trophy, Users, type LucideIcon } from "lucide-react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { LeaderboardPage } from "../features/leaderboard/index.js";
import { MembersPage } from "../features/members/index.js";
import { OverviewPage } from "../features/overview/index.js";
import { ReposPage } from "../features/repos/index.js";
import { ReportsPage } from "../features/reports/index.js";
import { ReviewDetailPage, ReviewsPage } from "../features/reviews/index.js";
import { SettingsPage } from "../features/settings/index.js";
import { RangePicker } from "../kernel/range.js";

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean; range?: boolean }
const groups: { title: string; items: Item[] }[] = [
  { title: "Phân tích", items: [
    { to: "/", label: "Tổng quan", icon: BarChart3, end: true, range: true },
    { to: "/reviews", label: "Review", icon: GitPullRequest },
    { to: "/leaderboard", label: "Xếp hạng", icon: Trophy, range: true },
  ] },
  { title: "Quản lý", items: [
    { to: "/members", label: "Thành viên", icon: Users },
    { to: "/repos", label: "Repository", icon: FolderGit2 },
    { to: "/reports", label: "Báo cáo", icon: FileText, range: true },
    { to: "/settings", label: "Cài đặt", icon: Settings },
  ] },
];
const all = groups.flatMap((g) => g.items);

function Shell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { dark, toggle } = useTheme();
  const current = all.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)));
  return (
    <div className="flex min-h-screen flex-wrap">
      <aside className="flex w-full flex-none flex-col gap-5 border-r bg-sidebar p-3 md:w-60">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <img src="/favicon.svg" alt="" className="size-[30px]" />
          <div className="leading-tight"><div className="text-[15px] font-semibold">ASDLC Review</div><div className="text-xs text-muted-foreground">MR review bằng AI</div></div>
        </div>
        <nav aria-label="Điều hướng" className="flex flex-col gap-0.5">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-0.5 [&:not(:first-child)]:mt-4">
              <div className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">{g.title}</div>
              {g.items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>
                  <n.icon className="size-4" aria-hidden="true" />{n.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-[999_1_560px] flex-col">
        <header className="flex min-h-14 items-center gap-3 border-b px-8">
          <span className="text-muted-foreground">ASDLC Review</span><span className="text-muted-foreground" aria-hidden="true">/</span>
          <span className="font-medium">{current?.label ?? "Chi tiết"}</span>
          <div className="ml-auto flex items-center gap-2">
            {current?.range && <RangePicker />}
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}>{dark ? <Sun /> : <Moon />}</Button>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 p-8">{children}</main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/reviews/:id" element={<ReviewDetailPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/repos" element={<ReposPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
