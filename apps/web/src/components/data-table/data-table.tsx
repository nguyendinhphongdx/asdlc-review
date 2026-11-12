import {
  flexRender, getCoreRowModel, getFacetedRowModel, getFacetedUniqueValues, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnFiltersState, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, MoreHorizontal, Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Empty, ErrorBox, Loading } from "../../kernel/page.js";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Class cho ô dữ liệu (căn lề, font…). */
    className?: string;
    /** Class cho ô tiêu đề. */
    headerClassName?: string;
    /** Tên cột trong menu "Cột" (mặc định lấy header dạng chuỗi). */
    label?: string;
    /** Chuỗi hiển thị cho từng giá trị của bộ lọc cột (mặc định chính giá trị). */
    filterLabels?: Record<string, string>;
  }
}

export type { ColumnDef } from "@tanstack/react-table";

export interface RowAction<T> {
  label: string;
  onSelect: (row: T) => void;
  destructive?: boolean;
  disabled?: boolean | ((row: T) => boolean);
  /** Ẩn mục theo từng dòng. */
  hidden?: (row: T) => boolean;
}

export interface TableFilter {
  /** `id` của cột (cột phải có accessor trả về chuỗi/số). */
  columnId: string;
  label: string;
  /** Mặc định lấy các giá trị khác nhau có trong dữ liệu. */
  options?: { value: string; label: string }[];
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  getRowId?: (row: T, index: number) => string;
  loading?: boolean;
  error?: unknown;
  /** Thanh tìm kiếm chung (tìm trong mọi cột có accessor). `false` để ẩn. */
  search?: false | { placeholder?: string };
  filters?: TableFilter[];
  /** Menu thao tác ở cuối mỗi dòng. */
  rowActions?: RowAction<any>[] | ((row: T) => RowAction<T>[]);
  /** Nút/điều khiển thêm ở bên phải thanh công cụ. */
  toolbar?: ReactNode;
  /** Cho phép bật/tắt cột. Mặc định chỉ bật khi có từ 5 cột trở lên. */
  columnToggle?: boolean;
  initialSort?: SortingState;
  initialHidden?: VisibilityState;
  pageSize?: number;
  pageSizes?: number[];
  /** `false` để không phân trang. */
  pagination?: boolean;
  /** Tên đơn vị cho dòng tổng, vd "MR" → "12 MR". */
  unit?: string;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Bọc trong Card có viền. `false` khi đặt bên trong Card khác. */
  framed?: boolean;
  /** Bảng gọn: không thanh công cụ/phân trang (cho bảng nhỏ trong thẻ). */
  compact?: boolean;
  className?: string;
  minWidth?: number;
  "aria-label"?: string;
}

const ALL = "__all";

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  const I = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return <I className={cn("size-3.5", dir ? "text-foreground" : "text-muted-foreground/60")} aria-hidden="true" />;
}

/**
 * Bảng dữ liệu dùng chung cho cả ứng dụng (TanStack Table + shadcn): tìm kiếm, lọc theo cột, sắp xếp,
 * bật/tắt cột, menu thao tác theo dòng, phân trang, trạng thái tải/lỗi/trống. Khai báo cột bằng `ColumnDef`
 * (tiêu đề và ô tuỳ biến bằng `header`/`cell`).
 */
export function DataTable<T>({
  columns, data, getRowId, loading, error, search = { placeholder: "Tìm kiếm…" }, filters = [], rowActions, toolbar, columnToggle, initialSort = [], initialHidden = {},
  pageSize = 10, pageSizes = [10, 25, 50, 100], pagination = true, unit = "dòng", empty, onRowClick, rowClassName, framed = true, compact = false, className, minWidth, "aria-label": ariaLabel,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [visibility, setVisibility] = useState<VisibilityState>(initialHidden);
  const paged = pagination && !compact;

  const withActions: ColumnDef<T, any>[] = rowActions
    ? [...columns, { id: "__actions", header: () => <span className="sr-only">Thao tác</span>, enableSorting: false, enableHiding: false, meta: { className: "w-12 text-right", headerClassName: "w-12" }, cell: ({ row }) => <RowMenu row={row.original} actions={rowActions} /> }]
    : columns;

  const table = useReactTable({
    data, columns: withActions, getRowId,
    state: { sorting, columnFilters, globalFilter, columnVisibility: visibility },
    onSortingChange: setSorting, onColumnFiltersChange: setColumnFilters, onGlobalFilterChange: setGlobalFilter, onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(), getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(paged ? { getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize, pageIndex: 0 } } } : {}),
    autoResetPageIndex: true,
  });

  const rows = table.getRowModel().rows;
  const total = data.length;
  const filtered = table.getFilteredRowModel().rows.length;
  const active = globalFilter !== "" || columnFilters.length > 0;
  const toggleable = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const showToggle = columnToggle ?? toggleable.length >= 5;
  const showToolbar = !compact && (search !== false || filters.length > 0 || showToggle || toolbar);
  const { pageIndex, pageSize: ps } = table.getState().pagination ?? { pageIndex: 0, pageSize: rows.length };

  const body = (
    <>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {search !== false && (
            <div className="relative min-w-[200px] flex-[1_1_240px] sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input aria-label="Tìm kiếm trong bảng" className="pl-9" placeholder={search.placeholder} value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
            </div>
          )}
          {filters.map((f) => {
            const col = table.getColumn(f.columnId);
            if (!col) return null;
            const labels = col.columnDef.meta?.filterLabels ?? {};
            const options = f.options ?? [...col.getFacetedUniqueValues().keys()].filter((v) => v !== undefined && v !== null && v !== "").map(String).sort().map((v) => ({ value: v, label: labels[v] ?? v }));
            const value = (col.getFilterValue() as string | undefined) ?? ALL;
            return (
              <Select key={f.columnId} value={value} onValueChange={(v) => col.setFilterValue(v === ALL ? undefined : v)}>
                <SelectTrigger aria-label={`Lọc theo ${f.label}`} className="h-9 w-auto min-w-[8.5rem]"><SelectValue placeholder={f.label} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{f.label}: tất cả</SelectItem>
                  {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            );
          })}
          {active && <Button variant="ghost" size="sm" onClick={() => { setGlobalFilter(""); setColumnFilters([]); }}><X />Xoá lọc</Button>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {showToggle && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Columns3 />Cột</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Hiển thị cột</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {toggleable.map((c) => (
                    <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                      {c.columnDef.meta?.label ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {toolbar}
          </div>
        </div>
      )}

      {loading ? <Loading /> : error ? <div className="p-3"><ErrorBox error={error} /></div> : !total ? (
        <Empty>{empty ?? "Chưa có dữ liệu"}</Empty>
      ) : !filtered ? <Empty>Không có dòng nào khớp bộ lọc</Empty> : (
        <Table aria-label={ariaLabel} style={minWidth ? { minWidth } : undefined}>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const dir = h.column.getIsSorted();
                  return (
                    <TableHead key={h.id} className={h.column.columnDef.meta?.headerClassName} aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : canSort ? "none" : undefined}>
                      {h.isPlaceholder ? null : canSort ? (
                        <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", dir && "text-foreground")}>
                          {flexRender(h.column.columnDef.header, h.getContext())}<SortIcon dir={dir} />
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={cn(onRowClick && "cursor-pointer", rowClassName?.(r.original))} onClick={onRowClick ? () => onRowClick(r.original) : undefined}>
                {r.getVisibleCells().map((c) => <TableCell key={c.id} className={c.column.columnDef.meta?.className}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {!compact && !loading && !error && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-[13px] text-muted-foreground">
          <span aria-live="polite">{active ? `${filtered} / ${total} ${unit}` : `${total} ${unit}`}</span>
          {paged && filtered > Math.min(...pageSizes) && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">Mỗi trang
                <Select value={String(ps)} onValueChange={(v) => table.setPageSize(Number(v))}>
                  <SelectTrigger aria-label="Số dòng mỗi trang" className="h-8 w-[4.5rem]"><SelectValue /></SelectTrigger>
                  <SelectContent>{pageSizes.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <span className="tabular-nums">{filtered ? pageIndex * ps + 1 : 0}–{Math.min(filtered, (pageIndex + 1) * ps)} / {filtered}</span>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Trước</Button>
                <Button variant="outline" size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Sau</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return framed ? <Card className={cn("overflow-hidden", className)}>{body}</Card> : <div className={className}>{body}</div>;
}

function RowMenu<T>({ row, actions }: { row: T; actions: RowAction<T>[] | ((row: T) => RowAction<T>[]) }) {
  const list = (typeof actions === "function" ? actions(row) : actions).filter((a) => !a.hidden?.(row));
  if (!list.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Thao tác"><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {list.map((a) => (
          <DropdownMenuItem key={a.label} variant={a.destructive ? "destructive" : "default"} disabled={typeof a.disabled === "function" ? a.disabled(row) : a.disabled} onSelect={() => a.onSelect(row)}>{a.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
