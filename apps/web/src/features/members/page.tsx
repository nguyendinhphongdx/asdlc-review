import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, ErrorBox, Loading, PageHeader } from "../../kernel/page.js";
import { createMember, deleteMember, listMembers, updateMember } from "./api.js";

export function MembersPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["members"], queryFn: listMembers });
  const inv = () => qc.invalidateQueries({ queryKey: ["members"] });
  const [name, setName] = useState(""); const [gl, setGl] = useState(""); const [team, setTeam] = useState("");
  const add = useMutation({ mutationFn: () => createMember({ displayName: name, team: team || null, identities: gl ? [{ platform: "gitlab", username: gl }] : [] }), onSuccess: () => { setName(""); setGl(""); setTeam(""); void inv(); } });
  const toggle = useMutation({ mutationFn: (a: { id: string; active: boolean }) => updateMember(a.id, { active: a.active }), onSuccess: inv });
  const del = useMutation({ mutationFn: deleteMember, onSuccess: inv });
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
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.length ? <Empty>Chưa có thành viên</Empty> : (
        <Card className="overflow-hidden"><Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Thành viên</TableHead><TableHead>Team</TableHead><TableHead>Tài khoản</TableHead><TableHead>Trạng thái</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{q.data.map((m) => (
            <TableRow key={m.id}>
              <TableCell><span className="inline-flex items-center gap-2.5"><Avatar name={m.displayName} className="size-8" /><span className="font-medium">{m.displayName}</span></span></TableCell>
              <TableCell>{m.team ?? "–"}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{m.identities.map((i) => `${i.platform}:${i.username}`).join(", ") || "–"}</TableCell>
              <TableCell><Badge variant={m.active ? "success" : "secondary"}>{m.active ? "Đang hoạt động" : "Đã tắt"}</Badge></TableCell>
              <TableCell className="space-x-2 text-right">
                <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: m.id, active: !m.active })}>{m.active ? "Tắt" : "Bật"}</Button>
                <Button size="sm" variant="outline" onClick={() => { if (confirm(`Xoá ${m.displayName}?`)) del.mutate(m.id); }}>Xoá</Button>
              </TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></Card>
      )}
    </>
  );
}
