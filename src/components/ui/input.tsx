import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, min, max, ...props }, ref) => {
    const isDate = type === "date";
    // Globally cap year to 4 digits (yyyy) for native date inputs.
    const effectiveMin = isDate ? (min ?? "1900-01-01") : min;
    const effectiveMax = isDate ? (max ?? "9999-12-31") : max;

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isDate) {
          const v = e.target.value;
          // Native input returns yyyy-mm-dd. If browser allowed 5+ digit year,
          // strip extra digits before propagating upstream.
          const m = v.match(/^(\d{5,})-(\d{2})-(\d{2})$/);
          if (m) {
            e.target.value = `${m[1].slice(0, 4)}-${m[2]}-${m[3]}`;
          }
        }
        onChange?.(e);
      },
      [isDate, onChange],
    );

    return (
      <input
        type={type}
        min={effectiveMin}
        max={effectiveMax}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
