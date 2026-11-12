import type { MemberDto } from "@mrd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable, type ColumnDef } from "@/components/data-table/data-table";
import { ErrorBox, PageHeader } from "../../kernel/page.js";
import { createMember, deleteMember, listMembers, updateMember } from "./api.js";

export function MembersPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["members"], queryFn: listMembers });
  const inv = () => qc.invalidateQueries({ queryKey: ["members"] });
  const [name, setName] = useState(""); const [gl, setGl] = useState(""); const [team, setTeam] = useState("");
  const add = useMutation({ mutationFn: () => createMember({ displayName: name, team: team || null, identities: gl ? [{ platform: "gitlab", username: gl }] : [] }), onSuccess: () => { setName(""); setGl(""); setTeam(""); void inv(); } });
  const toggle = useMutation({ mutationFn: (a: { id: string; active: boolean }) => updateMember(a.id, { active: a.active }), onSuccess: inv });
  const del = useMutation({ mutationFn: deleteMember, onSuccess: inv });
  const columns: ColumnDef<MemberDto>[] = [
    { accessorKey: "displayName", header: "Thành viên", cell: ({ row: { original: m } }) => <span className="inline-flex items-center gap-2.5"><Avatar name={m.displayName} className="size-8" /><span className="font-medium">{m.displayName}</span></span> },
    { id: "team", header: "Team", accessorFn: (m) => m.team ?? "–" },
    { id: "accounts", header: "Tài khoản", accessorFn: (m) => m.identities.map((i) => `${i.platform}:${i.username}`).join(", ") || "–", meta: { className: "font-mono text-xs text-muted-foreground" } },
    { id: "status", header: "Trạng thái", accessorFn: (m) => (m.active ? "Đang hoạt động" : "Đã tắt"), cell: ({ row: { original: m } }) => <Badge variant={m.active ? "success" : "secondary"}>{m.active ? "Đang hoạt động" : "Đã tắt"}</Badge> },
  ];
  return (
    <>
      <PageHeader title="Thành viên" description="MR của tác giả mới sẽ tự tạo thành viên; gộp nhiều tài khoản về một người ở đây." />
      <Card className="p-4">
        <form className="flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
          <Input aria-label="Tên hiển thị" className="w-52" placeholder="Tên hiển thị" value={name} onChange={(e) => setName(e.target.value)} />
          <Input aria-label="Username GitLab" className="w-52" placeholder="Username GitLab" value={gl} onChange={(e) => setGl(e.target.value)} />
          <Input aria-label="Team" className="w-40" placeholder="Team" value={team} onChange={(e) => setTeam(e.target.value)} />
          <Button type="submit" disabled={add.isPending}>Thêm</Button>
        </form>
        {add.error && <div className="mt-3"><ErrorBox error={add.error} /></div>}
      </Card>
      {(toggle.error || del.error) && <ErrorBox error={toggle.error ?? del.error} />}
      <DataTable<MemberDto>
        aria-label="Danh sách thành viên" columns={columns} data={q.data ?? []} loading={q.isLoading} error={q.error} getRowId={(m) => m.id}
        unit="thành viên" search={{ placeholder: "Tìm thành viên, team, tài khoản…" }} filters={[{ columnId: "team", label: "Team" }, { columnId: "status", label: "Trạng thái" }]}
        initialSort={[{ id: "displayName", desc: false }]} empty="Chưa có thành viên"
        rowActions={(m) => [
          { label: m.active ? "Tắt thành viên" : "Bật thành viên", onSelect: () => toggle.mutate({ id: m.id, active: !m.active }) },
          { label: "Xoá thành viên", destructive: true, onSelect: () => { if (confirm(`Xoá ${m.displayName}?`)) del.mutate(m.id); } },
        ]}
      />
    </>
  );
}
