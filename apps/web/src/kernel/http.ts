export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Điểm gọi mạng duy nhất của web; các feature chỉ gọi qua đây (R18). */
export async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;
  if (init?.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await globalThis.fetch(path, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) }, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text;
    try { msg = (JSON.parse(text) as { message?: string; error?: string }).message ?? (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* giữ text */ }
    throw new ApiError(res.status, msg || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
