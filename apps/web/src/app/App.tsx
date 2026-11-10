import { BarChart3, FileText, FolderGit2, GitPullRequest, Settings, Trophy, Users } from "lucide-react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { LeaderboardPage } from "../features/leaderboard/index.js";
import { MembersPage } from "../features/members/index.js";
import { OverviewPage } from "../features/overview/index.js";
import { ReposPage } from "../features/repos/index.js";
import { ReportsPage } from "../features/reports/index.js";
import { ReviewDetailPage, ReviewsPage } from "../features/reviews/index.js";
import { SettingsPage } from "../features/settings/index.js";

const nav = [
  { to: "/", label: "Tổng quan", icon: BarChart3, end: true },
  { to: "/reviews", label: "Review", icon: GitPullRequest },
  { to: "/leaderboard", label: "Xếp hạng", icon: Trophy },
  { to: "/members", label: "Thành viên", icon: Users },
  { to: "/repos", label: "Repository", icon: FolderGit2 },
  { to: "/reports", label: "Báo cáo", icon: FileText },
  { to: "/settings", label: "Cài đặt", icon: Settings },
];

export function App() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-3">
        <div className="mb-4 px-2 text-lg font-bold text-indigo-700">ASDLC Review</div>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${isActive ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
            <n.icon size={16} />{n.label}
          </NavLink>
        ))}
      </aside>
      <main className="min-w-0 flex-1 p-6">
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
      </main>
    </div>
  );
}
