import { useEffect, useState } from "react";

/** Thông tin cập nhật do vỏ desktop (Electron) trả về qua preload; không có khi chạy trên trình duyệt. */
export interface UpdateInfo { current: string; latest: string; available: boolean; canAuto: boolean; page: string }
export type UpdateEvent = { type: "available"; info: UpdateInfo } | { type: "progress"; phase: "download" | "verify" | "extract" | "restart"; percent?: number } | { type: "error"; message: string };
interface Bridge {
  version(): Promise<{ version: string; packaged: boolean }>;
  state(): Promise<UpdateInfo | null>;
  check(): Promise<UpdateInfo>;
  install(): Promise<void>;
  onEvent(cb: (e: UpdateEvent) => void): () => void;
}
declare global { interface Window { mrdDesktop?: Bridge } }

export const desktop = (): Bridge | undefined => window.mrdDesktop;

/** Bản mới đã biết (từ kiểm tra nền) để hiện chấm báo ở sidebar. */
export function useUpdateAvailable(): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    const d = desktop();
    if (!d) return;
    void d.state().then((s) => s?.available && setInfo(s)).catch(() => undefined);
    return d.onEvent((e) => { if (e.type === "available") setInfo(e.info); });
  }, []);
  return info;
}
