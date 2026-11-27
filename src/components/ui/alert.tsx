import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Avisos: fundo suave, borda inteira discreta e ícone à esquerda no tom do aviso (sem faixa lateral nem bloco saturado).
const alertVariants = cva(
  "relative w-full rounded-lg border px-3 py-2.5 text-sm [&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3 [&>svg]:size-4 [&>svg~*]:pl-6 [&>svg+div]:translate-y-[-1px]",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground [&>svg]:text-muted-foreground",
        info: "border-info-border bg-info-soft text-info-soft-foreground [&>svg]:text-turquoise-700",
        warning: "border-pending-border bg-pending text-pending-foreground [&>svg]:text-warning-700",
        success: "border-success-border bg-success-soft text-success-soft-foreground [&>svg]:text-success",
        destructive:
          "border-destructive-border bg-destructive-soft text-destructive-soft-foreground [&>svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn("mb-0.5 font-semibold leading-snug", className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
