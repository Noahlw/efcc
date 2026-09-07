import { cva, type VariantProps } from "class-variance-authority";

export const actionSurfaceVariants = cva(
  "static isolate grid min-h-11 w-full min-w-0 max-h-[min(48dvh,420px)] gap-[var(--space-3)] mt-[var(--space-4)] overflow-y-auto overscroll-contain rounded-[var(--radius-md)] border bg-[var(--surface-raised)] p-[var(--space-3)] pb-[calc(var(--space-3)+env(safe-area-inset-bottom,0px))] text-sm shadow-[var(--shadow-dock)] scroll-mb-[calc(84px+env(safe-area-inset-bottom,0px))] data-disabled:opacity-70 [&_:is(a):focus-visible]:outline-[3px]! [&_:is(a):focus-visible]:outline-[var(--focus)]! [&_:is(a):focus-visible]:outline-offset-[3px]!",
  {
    variants: {
      state: {
        dirty: "border-input",
        selection: "border-input",
        review: "border-ring",
        save: "border-primary",
        busy: "border-input",
        failure: "border-[var(--error-border)] bg-[var(--error-surface)]",
        conflict: "border-[var(--error-border)] bg-[var(--error-surface)]",
      },
    },
    defaultVariants: {
      state: "selection",
    },
  }
);

export type ActionSurfaceState = NonNullable<
  VariantProps<typeof actionSurfaceVariants>["state"]
>;
