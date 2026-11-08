import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        admin: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
        manager: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
        specialist: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
        inactive: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
