import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";

export const directoryFrameVariants = cva(
  "mx-auto min-w-0 w-full px-[var(--space-4)] pt-[var(--space-6)] pb-[var(--space-9)]",
  {
    variants: {
      width: {
        wide: "max-w-[1180px]",
        compact: "max-w-[760px]",
      },
      content: {
        list: "",
        detail: "max-[799px]:pb-[var(--space-8)]",
      },
    },
    compoundVariants: [
      {
        width: "wide",
        content: "detail",
        class: "min-[1024px]:px-[var(--space-6)]",
      },
    ],
    defaultVariants: {
      width: "wide",
      content: "list",
    },
  }
);

export type DirectoryFrameVariants = VariantProps<
  typeof directoryFrameVariants
>;
