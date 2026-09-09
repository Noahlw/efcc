import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

const pageFrameVariants = cva(
  "mx-auto min-w-0 w-full px-[var(--space-4)] pt-[var(--space-6)] pb-[var(--space-9)]",
  {
    variants: {
      width: {
        wide: "max-w-[1180px]",
        compact: "max-w-[760px]",
      },
    },
    defaultVariants: {
      width: "wide",
    },
  }
);

export type PageFrameWidth = NonNullable<
  VariantProps<typeof pageFrameVariants>["width"]
>;

export interface PageFrameProps extends Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> {
  children: ReactNode;
  width?: PageFrameWidth;
}

export const PageFrame = ({
  children,
  className,
  width,
  ...props
}: PageFrameProps) => (
  <div
    {...props}
    className={cn(pageFrameVariants({ width, className }))}
    data-page-frame
    data-page-frame-width={width ?? "wide"}
  >
    {children}
  </div>
);
