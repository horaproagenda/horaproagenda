import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => {
    const topScrollRef = React.useRef<HTMLDivElement>(null);
    const bottomScrollRef = React.useRef<HTMLDivElement>(null);
    const tableRef = React.useRef<HTMLTableElement>(null);
    const [scrollWidth, setScrollWidth] = React.useState(0);
    const [hasOverflow, setHasOverflow] = React.useState(false);
    const syncing = React.useRef<"top" | "bottom" | null>(null);

    React.useImperativeHandle(ref, () => tableRef.current as HTMLTableElement);

    React.useEffect(() => {
      const table = tableRef.current;
      const container = bottomScrollRef.current;
      if (!table || !container) return;
      const update = () => {
        setScrollWidth(table.scrollWidth);
        setHasOverflow(table.scrollWidth > container.clientWidth + 1);
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(table);
      ro.observe(container);
      return () => ro.disconnect();
    }, []);

    const onScroll = (source: "top" | "bottom") => () => {
      if (syncing.current && syncing.current !== source) return;
      syncing.current = source;
      const top = topScrollRef.current;
      const bottom = bottomScrollRef.current;
      if (top && bottom) {
        if (source === "top") bottom.scrollLeft = top.scrollLeft;
        else top.scrollLeft = bottom.scrollLeft;
      }
      requestAnimationFrame(() => {
        syncing.current = null;
      });
    };

    return (
      <div className="relative w-full">
        {hasOverflow && (
          <div
            ref={topScrollRef}
            onScroll={onScroll("top")}
            className="overflow-x-auto overflow-y-hidden h-2.5 mb-1 scrollbar-visible"
            aria-hidden="true"
          >
            <div style={{ width: scrollWidth, height: 1 }} />
          </div>
        )}
        <div
          ref={bottomScrollRef}
          onScroll={onScroll("bottom")}
          className="relative w-full overflow-auto scrollbar-visible"
          style={{ touchAction: "pan-x pan-y", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}
        >
          <table ref={tableRef} className={cn("w-full caption-bottom text-xs sm:text-sm", className)} {...props} />
        </div>
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-9 px-2.5 text-left align-middle font-medium text-muted-foreground text-[11px] uppercase tracking-wide [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("px-2.5 py-2 align-middle [&:has([role=checkbox])]:pr-0", className)} {...props} />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
