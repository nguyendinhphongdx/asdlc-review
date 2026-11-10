import { createContext, useContext, useState, type ReactNode } from "react";
import { Select } from "@/components/ui/input";

const Ctx = createContext<{ days: number; setDays: (n: number) => void }>({ days: 30, setDays: () => undefined });
export const useRange = () => useContext(Ctx);
export function RangeProvider({ children }: { children: ReactNode }) {
  const [days, setDays] = useState(30);
  return <Ctx.Provider value={{ days, setDays }}>{children}</Ctx.Provider>;
}
export function RangePicker() {
  const { days, setDays } = useRange();
  return (
    <Select aria-label="Khoảng thời gian" value={days} onChange={(e) => setDays(Number(e.target.value))}>
      {[7, 14, 30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} ngày gần nhất</option>)}
    </Select>
  );
}
