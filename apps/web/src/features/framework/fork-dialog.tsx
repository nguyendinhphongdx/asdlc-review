import type { FrameworkDetailDto, FrameworkInfoDto } from "@mrd/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ErrorBox } from "../../kernel/page.js";
import { Field, Modal } from "../../kernel/modal.js";
import { forkFramework } from "./api.js";

/** Tạo bản chỉnh sửa (fork) từ bản mặc định hoặc mẫu. */
export function ForkDialog({ bases, initialBaseId, onClose, onDone }: { bases: FrameworkInfoDto[]; initialBaseId: string; onClose: () => void; onDone: (d: FrameworkDetailDto) => void }) {
  const [baseId, setBaseId] = useState(initialBaseId);
  const base = bases.find((b) => b.id === baseId);
  const [name, setName] = useState(base ? `${base.name} (bản chỉnh sửa)` : "");
  const [touched, setTouched] = useState(false);
  const fork = useMutation({ mutationFn: () => forkFramework(baseId, name.trim()), onSuccess: onDone });
  const err = touched && !name.trim() ? "Nhập tên cho bản chỉnh sửa" : null;
  const submit = () => { setTouched(true); if (name.trim() && !fork.isPending) fork.mutate(); };
  return (
    <Modal title="Tạo từ mẫu" description="Sao chép một mẫu thành bản của bạn để chỉnh trọng số, rule và gate. Mẫu gốc không bị đổi." onClose={onClose}
      footer={<><Button type="button" variant="outline" onClick={onClose}>Huỷ</Button><Button type="button" disabled={fork.isPending} onClick={submit}>{fork.isPending ? "Đang tạo…" : "Tạo bản chỉnh sửa"}</Button></>}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Mẫu gốc" htmlFor="fork-base"><Select id="fork-base" className="w-full" value={baseId} onChange={(e) => { const b = bases.find((x) => x.id === e.target.value); setBaseId(e.target.value); if (!touched && b) setName(`${b.name} (bản chỉnh sửa)`); }}>
          {bases.map((b) => <option key={b.id} value={b.id}>{b.name} v{b.version}{b.kind === "default" ? " (mặc định)" : ""} · {b.ruleCount} rule</option>)}</Select></Field>
        <Field label="Tên bản chỉnh sửa" htmlFor="fork-name" error={err}><Input id="fork-name" maxLength={120} value={name} aria-invalid={!!err} aria-describedby={err ? "fork-name-err" : undefined} onChange={(e) => { setName(e.target.value); setTouched(true); }} /></Field>
        {fork.error && <ErrorBox error={fork.error} />}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
