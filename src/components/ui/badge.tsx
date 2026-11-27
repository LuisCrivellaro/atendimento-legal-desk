import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Etiquetas pequenas e suaves (20px): cor de fundo clara, borda discreta e texto escuro do mesmo tom.
const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-2xs font-medium leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-info-border bg-info-soft text-info-soft-foreground",
        secondary: "border-transparent bg-muted text-graphite-700",
        destructive: "border-destructive-border bg-destructive-soft text-destructive-soft-foreground",
        outline: "border-border-strong text-foreground",
        warning: "border-pending-border bg-pending text-pending-foreground",
        success: "border-success-border bg-success-soft text-success-soft-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
