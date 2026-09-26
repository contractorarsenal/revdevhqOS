"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel,
  getPaginationRowModel, getSortedRowModel, type SortingState, useReactTable,
} from "@tanstack/react-table";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Per-column responsive helper, e.g. { className: "hidden md:table-cell" } to drop a column on phones. */
export type ColMeta = { className?: string };

export function sortableHeader(label: string) {
  // eslint-disable-next-line react/display-name, @typescript-eslint/no-explicit-any
  return ({ column }: any) => (
    <button
      className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider hover:text-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label} <ArrowUpDown className="size-3" />
    </button>
  );
}

/** Clicks that start on (or inside) a control must never trigger row
 * navigation. Portaled content (dialogs, menus) bubbles through React but is
 * not a DOM descendant of the row, so it is excluded by the contains() check. */
const INTERACTIVE = "a, button, input, select, textarea, label, [role=menuitem], [role=checkbox], [data-row-action]";
export function isRowActivation(e: { target: EventTarget; currentTarget: Element }): boolean {
  const el = e.target as HTMLElement;
  if (!e.currentTarget.contains(el)) return false;
  const control = el.closest(INTERACTIVE);
  return !(control && e.currentTarget.contains(control));
}

export function DataTable<TData extends { id: string }, TValue>({
  columns, data, searchPlaceholder = "Search…", onRowClick, getRowHref, rowLabel, toolbar, emptyMessage = "No records yet.", highlightId,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  /** Whole row navigates here on click / Enter (Cmd/Ctrl-click opens a new tab). */
  getRowHref?: (row: TData) => string;
  /** Accessible name for a navigable row, e.g. "Open Acme Roofing". */
  rowLabel?: (row: TData) => string;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  /** When a row's id matches, it's highlighted and scrolled into view once — used for "open this specific record" deep links (e.g. from the Dashboard). */
  highlightId?: string;
}) {
  const router = useRouter();
  const clickable = Boolean(onRowClick || getRowHref);
  const activate = (row: TData, newTab = false) => {
    const href = getRowHref?.(row);
    if (href) {
      if (newTab) window.open(href, "_blank", "noopener");
      else router.push(href);
    } else onRowClick?.(row);
  };
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (highlightId) highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 } },
    globalFilterFn: "includesString",
  });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-56 pl-8 text-[12.5px]"
          />
        </div>
        {toolbar}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className={cn("h-9 whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground", (h.column.columnDef.meta as ColMeta | undefined)?.className)}>
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    ref={row.original.id === highlightId ? highlightRef : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={clickable ? rowLabel?.(row.original) : undefined}
                    className={cn(
                      clickable && "group/row cursor-pointer outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary active:bg-accent",
                      row.original.id === highlightId && "bg-primary/10 hover:bg-primary/10"
                    )}
                    onMouseEnter={getRowHref ? () => router.prefetch(getRowHref(row.original)) : undefined}
                    onClick={clickable ? (e) => { if (isRowActivation(e)) activate(row.original, e.metaKey || e.ctrlKey); } : undefined}
                    onKeyDown={clickable ? (e) => { if (e.key === "Enter" && e.target === e.currentTarget) activate(row.original); } : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn("whitespace-nowrap py-2.5 text-[12.5px]", (cell.column.columnDef.meta as ColMeta | undefined)?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            {table.getFilteredRowModel().rows.length} record{table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
            </span>
            <Button variant="ghost" size="icon" className="size-7" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
