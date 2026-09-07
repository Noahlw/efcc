import { cva } from "class-variance-authority";

export const roleButtonVariants = cva(
  "flex h-auto min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3 text-left whitespace-normal outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
  {
    variants: {
      state: {
        active: "border-primary",
        default: "border-border",
      },
    },
    defaultVariants: {
      state: "default",
    },
  }
);

export const permissionRowVariants = cva(
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-background p-3",
  {
    variants: {
      state: {
        clean: "border-border",
        changed: "border-primary bg-primary/5",
      },
      disabled: {
        true: "opacity-70",
        false: "",
      },
    },
    defaultVariants: {
      state: "clean",
      disabled: false,
    },
  }
);

export const stateSurfaceVariants = cva("mt-6 rounded-lg border p-4", {
  variants: {
    kind: {
      loading: "block border-border",
      error: "grid gap-3 border-destructive bg-destructive/10",
      forbidden: "border-destructive bg-destructive/10",
    },
  },
});
