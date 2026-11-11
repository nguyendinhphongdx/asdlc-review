import { Button } from "@/components/ui/button";

/** Hộp xác nhận nội tuyến cho thao tác nguy hiểm. */
export function InlineConfirm({ message, confirmLabel, pending, onConfirm, onCancel }: { message: string; confirmLabel: string; pending?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="alertdialog" aria-label={message} className="flex flex-wrap items-center gap-3 rounded-lg border border-danger bg-danger-bg px-4 py-3 text-sm text-danger-fg">
      <span className="min-w-0 flex-[1_1_260px]">{message}</span>
      <span className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={pending}>Huỷ</Button>
        <Button type="button" size="sm" variant="destructive" onClick={onConfirm} disabled={pending}>{confirmLabel}</Button>
      </span>
    </div>
  );
}
