import {
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import { cn } from "@/lib/utils";

type SortDirection = "asc" | "desc";

interface SortState {
  signature: string;
  index: number | null;
  direction: SortDirection;
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function cellText(row: HTMLTableRowElement, index: number): string {
  return (row.cells[index]?.innerText ?? "").replace(/\s+/g, " ").trim();
}

function asNumber(value: string): number | null {
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/[€%]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function asDate(value: string): number | null {
  const dmy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) {
    return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])).getTime();
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  }
  return null;
}

function isEmpty(value: string): boolean {
  return !value || value === "—" || value === "-";
}

function compareValues(left: string, right: string): number {
  if (isEmpty(left) && isEmpty(right)) return 0;
  if (isEmpty(left)) return 1;
  if (isEmpty(right)) return -1;

  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);
  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber - rightNumber;
  }

  const leftDate = asDate(left);
  const rightDate = asDate(right);
  if (leftDate !== null && rightDate !== null) {
    return leftDate - rightDate;
  }

  return collator.compare(left, right);
}

function isSortableHeader(header: HTMLTableCellElement): boolean {
  if (header.dataset.noSort !== undefined) return false;
  if (header.querySelector("button, a, input, select")) return false;
  const text = (header.textContent ?? "").trim();
  return text.length > 0 && !/^actions?$/i.test(text);
}

function applySort(table: HTMLTableElement, index: number, direction: SortDirection): void {
  const body = table.tBodies[0];
  if (!body) return;
  const rows = Array.from(body.rows).filter((row) => row.cells.length > index);
  rows.sort((left, right) => {
    const result = compareValues(cellText(left, index), cellText(right, index));
    return direction === "asc" ? result : -result;
  });
  for (const row of rows) {
    body.appendChild(row);
  }
}

function headerSignature(table: HTMLTableElement): string {
  return Array.from(table.tHead?.rows[0]?.cells ?? [])
    .map((cell) => (cell.textContent ?? "").trim())
    .join("|");
}

function decorateHeaders(table: HTMLTableElement, state: SortState): void {
  const headers = Array.from(table.tHead?.rows[0]?.cells ?? []);
  headers.forEach((header, index) => {
    if (!isSortableHeader(header)) {
      delete header.dataset.sortable;
      header.removeAttribute("aria-sort");
      header.removeAttribute("tabindex");
      header.removeAttribute("title");
      return;
    }
    header.dataset.sortable = "true";
    header.tabIndex = 0;
    header.title = "Trier cette colonne";
    header.setAttribute(
      "aria-sort",
      state.index === index
        ? state.direction === "asc"
          ? "ascending"
          : "descending"
        : "none",
    );
  });
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  const tableRef = useRef<HTMLTableElement>(null);
  const sortState = useRef<SortState>({ signature: "", index: null, direction: "asc" });

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const signature = headerSignature(table);
    if (sortState.current.signature !== signature) {
      sortState.current = { signature, index: null, direction: "asc" };
    }
    decorateHeaders(table, sortState.current);
    if (sortState.current.index !== null) {
      applySort(table, sortState.current.index, sortState.current.direction);
    }
  });

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const toggle = (header: HTMLTableCellElement) => {
      if (!isSortableHeader(header)) return;
      const row = header.parentElement as HTMLTableRowElement | null;
      if (!row) return;
      const index = Array.from(row.cells).indexOf(header);
      if (index < 0) return;
      const current = sortState.current;
      const direction: SortDirection =
        current.index === index && current.direction === "asc" ? "desc" : "asc";
      sortState.current = {
        signature: headerSignature(table),
        index,
        direction,
      };
      decorateHeaders(table, sortState.current);
      applySort(table, index, direction);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, select")) return;
      const header = target.closest("th");
      if (header instanceof HTMLTableCellElement) toggle(header);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as HTMLElement;
      const header = target.closest("th");
      if (header instanceof HTMLTableCellElement && header.dataset.sortable === "true") {
        event.preventDefault();
        toggle(header);
      }
    };

    table.addEventListener("click", onClick);
    table.addEventListener("keydown", onKeyDown);
    return () => {
      table.removeEventListener("click", onClick);
      table.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div className="w-full overflow-x-auto">
      <table ref={tableRef} className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-border-soft [&_tr]:bg-background-soft/50", className)} {...props} />
  ),
);
TableHeader.displayName = "TableHeader";

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border-soft/60 transition-colors hover:bg-primary/[0.055] data-[state=selected]:bg-primary/10",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-9 whitespace-nowrap px-3 text-left align-middle text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-3 py-2.5 align-middle text-sm text-foreground", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";
