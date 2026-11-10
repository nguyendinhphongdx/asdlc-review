import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Card, Empty, ErrorBox, Loading, PageHeader, inputCls } from "../../kernel/ui.js";
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
      <PageHeader title="Thành viên" />
      <Card className="mb-4">
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(); }}>
          <input className={inputCls} placeholder="Tên hiển thị" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls} placeholder="Username GitLab" value={gl} onChange={(e) => setGl(e.target.value)} />
          <input className={inputCls} placeholder="Team" value={team} onChange={(e) => setTeam(e.target.value)} />
          <Button type="submit" disabled={add.isPending}>Thêm</Button>
        </form>
        {add.error && <div className="mt-2"><ErrorBox error={add.error} /></div>}
      </Card>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.length ? <Empty>Chưa có thành viên. MR của tác giả mới sẽ tự tạo thành viên.</Empty> : (
        <Card><table className="w-full text-sm"><tbody>
          {q.data.map((m) => (
            <tr key={m.id} className="border-t border-slate-100 first:border-0">
              <td className="py-2 font-medium">{m.displayName}</td><td className="text-slate-500">{m.team ?? ""}</td>
              <td className="text-xs text-slate-500">{m.identities.map((i) => `${i.platform}:${i.username}`).join(", ")}</td>
              <td className="space-x-2 text-right">
                <Button variant="ghost" onClick={() => toggle.mutate({ id: m.id, active: !m.active })}>{m.active ? "Tắt" : "Bật"}</Button>
                <Button variant="ghost" onClick={() => { if (confirm(`Xoá ${m.displayName}?`)) del.mutate(m.id); }}>Xoá</Button>
              </td>
            </tr>
          ))}
        </tbody></table></Card>
      )}
    </>
  );
}
