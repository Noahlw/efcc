"use client";

import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { ChevronLeft, Search } from "lucide-react";
import Link from "next/link";
import { Slot } from "radix-ui";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ScreenCardPrimitive,
  screenCardPrimitiveVariants,
} from "@/components/ui/screen-card";
import {
  ScreenIconButtonPrimitive as ScreenIconButton,
  screenIconButtonPrimitiveVariants as screenIconButtonVariants,
} from "@/components/ui/screen-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const screenPageFrameVariants = cva(
  "mx-auto min-w-0 w-full bg-[var(--screen-canvas)] px-[var(--screen-gutter)] pt-5 pb-7 text-[var(--screen-ink)] text-[length:var(--screen-body-size)] leading-[var(--screen-body-leading)] [font-family:var(--screen-font-sans)] min-[800px]:px-6",
  {
    variants: {
      width: {
        wide: "max-w-[920px]",
        compact: "max-w-[760px]",
      },
    },
    defaultVariants: {
      width: "wide",
    },
  }
);

export type ScreenPageFrameWidth = NonNullable<
  VariantProps<typeof screenPageFrameVariants>["width"]
>;

export interface ScreenPageFrameProps extends React.ComponentPropsWithoutRef<"div"> {
  width?: ScreenPageFrameWidth;
}

/**
 * Shared screen content plane. Use it as the route-owned content boundary;
 * callers provide records and arrangement, while this component owns the
 * phone gutter, body typography, and compatible content width.
 */
export const ScreenPageFrame = ({
  children,
  className,
  width,
  ...props
}: ScreenPageFrameProps) => (
  <div
    {...props}
    className={cn(screenPageFrameVariants({ width }), className)}
    data-screen-foundation="page-frame"
    data-screen-width={width ?? "wide"}
  >
    {children}
  </div>
);

export {
  screenIconButtonPrimitiveVariants as screenIconButtonVariants,
  ScreenIconButtonPrimitive as ScreenIconButton,
} from "@/components/ui/screen-controls";
export type {
  ScreenIconButtonPrimitiveProps as ScreenIconButtonProps,
  ScreenIconButtonPrimitiveTone as ScreenIconButtonTone,
} from "@/components/ui/screen-controls";

const screenHeaderVariants = cva("mb-5 grid gap-2", {
  variants: {
    level: {
      root: "",
      child: "",
    },
  },
  defaultVariants: {
    level: "root",
  },
});

const screenHeadingVariants = cva(
  "m-0 min-w-0 wrap-anywhere font-extrabold tracking-[-0.03em] text-[var(--screen-ink)] outline-none focus-visible:ring-3 focus-visible:ring-[var(--screen-focus)]",
  {
    variants: {
      level: {
        root: "text-[length:var(--screen-root-title-size)] leading-[var(--screen-root-title-leading)]",
        child:
          "text-[length:var(--screen-child-title-size)] leading-[var(--screen-child-title-leading)]",
      },
    },
    defaultVariants: {
      level: "root",
    },
  }
);

export type ScreenHeaderLevel = NonNullable<
  VariantProps<typeof screenHeaderVariants>["level"]
>;

export interface ScreenHeaderProps {
  title: React.ReactNode;
  lead?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  status?: React.ReactNode;
  action?: React.ReactNode;
  headingId?: string;
  headingRef?: React.Ref<HTMLHeadingElement>;
  backReplace?: boolean;
  onBack?: React.MouseEventHandler<HTMLAnchorElement>;
  level?: ScreenHeaderLevel;
  className?: string;
}

/**
 * Shared route header with token-owned title rhythm and a universal icon-only
 * Back affordance. The route still supplies the destination and owns history
 * semantics; this component never calls history.back().
 */
export const ScreenHeader = ({
  action,
  backHref,
  backLabel = "返回",
  backReplace,
  className,
  headingId,
  headingRef,
  lead,
  level = "root",
  onBack,
  status,
  title,
}: ScreenHeaderProps) => {
  const handleBackClick: React.MouseEventHandler<HTMLAnchorElement> = (
    event
  ) => {
    onBack?.(event);
    if (
      event.defaultPrevented ||
      !backReplace ||
      !backHref ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    window.location.replace(backHref);
  };

  const hasActions = Boolean(status || action);
  const hasBack = Boolean(backHref);

  return (
    <header
      className={cn(screenHeaderVariants({ level }), className)}
      data-route-header
      data-screen-foundation="header"
      data-screen-level={level}
    >
      <div
        className={cn(
          "grid min-w-0 items-start gap-2",
          hasBack
            ? "grid-cols-[var(--screen-touch-target)_minmax(0,1fr)_auto]"
            : "grid-cols-[minmax(0,1fr)_auto]"
        )}
        data-route-header-main
        data-screen-header-main
      >
        {backHref ? (
          // eslint-disable-next-line no-use-before-define -- icon button is exported with the other control primitives below
          <ScreenIconButton aria-label={backLabel} asChild title={backLabel}>
            <Link
              href={backHref}
              onClickCapture={onBack ? handleBackClick : undefined}
              onClick={onBack ? undefined : handleBackClick}
              replace={backReplace}
            >
              <ChevronLeft aria-hidden="true" />
            </Link>
          </ScreenIconButton>
        ) : null}
        <div className="min-w-0">
          <h1
            className={screenHeadingVariants({ level })}
            data-screen-heading={level}
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
          >
            {title}
          </h1>
          {lead ? (
            <p className="m-0 mt-1 max-w-[62ch] wrap-anywhere text-[var(--screen-muted)] text-sm leading-5">
              {lead}
            </p>
          ) : null}
        </div>
        {hasActions ? (
          <div
            className="flex min-w-0 max-w-[46%] flex-wrap items-center justify-end gap-[var(--screen-utility-gap)]"
            data-route-header-actions
            data-screen-header-actions
          >
            {status}
            {action}
          </div>
        ) : null}
      </div>
    </header>
  );
};

export interface ScreenSectionProps extends Omit<
  React.ComponentPropsWithoutRef<"section">,
  "title"
> {
  title?: React.ReactNode;
  action?: React.ReactNode;
  headingId?: string;
  headingRef?: React.Ref<HTMLHeadingElement>;
}

/** Repeated section rhythm and heading/action alignment for screen families. */
export const ScreenSection = ({
  action,
  children,
  className,
  headingId,
  headingRef,
  title,
  ...props
}: ScreenSectionProps) => (
  <section
    {...props}
    aria-labelledby={headingId ?? props["aria-labelledby"]}
    className={cn(
      "mt-[var(--screen-section-gap)] grid gap-3 first:mt-0",
      className
    )}
    data-screen-foundation="section"
  >
    {title ? (
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2
          className="m-0 min-w-0 wrap-anywhere text-[length:var(--screen-section-title-size)] font-bold leading-[var(--screen-section-title-leading)] tracking-[-0.015em]"
          id={headingId}
          ref={headingRef}
        >
          {title}
        </h2>
        {action ? (
          <div className="shrink-0" data-screen-section-action>
            {action}
          </div>
        ) : null}
      </div>
    ) : null}
    {children}
  </section>
);

type ScreenSearchInputProps = Pick<
  React.ComponentPropsWithoutRef<typeof Input>,
  | "aria-describedby"
  | "aria-busy"
  | "autoComplete"
  | "autoFocus"
  | "defaultValue"
  | "disabled"
  | "id"
  | "inputMode"
  | "maxLength"
  | "name"
  | "onBlur"
  | "onChange"
  | "onFocus"
  | "onKeyDown"
  | "pattern"
  | "placeholder"
  | "readOnly"
  | "required"
  | "spellCheck"
  | "value"
>;

export type ScreenSearchProps = ScreenSearchInputProps & {
  "aria-label": string;
  /** Additional layout classes apply to the search wrapper, not the input primitive. */
  className?: string;
};

/** Search control with the frozen 44px field geometry and leading icon. */
export const ScreenSearch = ({
  "aria-busy": ariaBusy,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  autoComplete,
  autoFocus,
  className,
  defaultValue,
  disabled,
  id,
  inputMode,
  maxLength,
  name,
  onBlur,
  onChange,
  onFocus,
  onKeyDown,
  pattern,
  placeholder,
  readOnly,
  required,
  spellCheck,
  value,
}: ScreenSearchProps) => (
  <div
    className={cn("relative min-w-0", className)}
    data-screen-foundation="search"
  >
    <Search
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-[var(--screen-muted)]"
    />
    <Input
      aria-busy={ariaBusy}
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabel}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      className="screen-search-input"
      data-screen-search-input
      defaultValue={defaultValue}
      disabled={disabled}
      id={id}
      inputMode={inputMode}
      maxLength={maxLength}
      name={name}
      onBlur={onBlur}
      onChange={onChange}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      pattern={pattern}
      placeholder={placeholder}
      readOnly={readOnly}
      required={required}
      type="search"
      spellCheck={spellCheck}
      value={value}
    />
  </div>
);

export type ScreenFiltersProps = React.ComponentPropsWithoutRef<"div">;

/** Horizontally scrollable filter group that keeps each chip a touch target. */
export const ScreenFilters = ({ className, ...props }: ScreenFiltersProps) => (
  <div
    {...props}
    className={cn(
      "flex min-w-0 gap-[var(--screen-utility-gap)] overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      className
    )}
    data-screen-foundation="filters"
  />
);

export {
  screenFilterChipPrimitiveVariants as screenFilterChipVariants,
  ScreenFilterChipPrimitive as ScreenFilterChip,
} from "@/components/ui/screen-controls";
export type { ScreenFilterChipPrimitiveProps as ScreenFilterChipProps } from "@/components/ui/screen-controls";

const screenRowVariants = cva(
  "group/screen-row flex min-w-0 w-full items-center gap-3 border-b border-[var(--screen-line)] text-[var(--screen-ink)] no-underline outline-none focus-visible:bg-[var(--screen-surface-soft)] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[var(--screen-focus)]",
  {
    variants: {
      density: {
        collection:
          "min-h-[var(--screen-row-min-height)] py-[var(--screen-row-padding-block)]",
        settings:
          "min-h-[var(--screen-settings-row-min-height)] py-[var(--screen-settings-row-padding-block)]",
      },
      selected: {
        false: "",
        true: "bg-[var(--screen-accent-soft)]",
      },
      tone: {
        default: "",
        danger: "text-[var(--screen-danger)]",
      },
    },
    defaultVariants: {
      density: "collection",
      selected: false,
      tone: "default",
    },
  }
);

export type ScreenRowDensity = NonNullable<
  VariantProps<typeof screenRowVariants>["density"]
>;

export type ScreenRowTone = NonNullable<
  VariantProps<typeof screenRowVariants>["tone"]
>;

export interface ScreenRowProps
  extends
    React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof screenRowVariants> {
  asChild?: boolean;
}

/**
 * Two-line collection/settings row. Use `asChild` for a route-owned Link;
 * density and minimum geometry remain foundation-owned.
 */
export const ScreenRow = ({
  asChild = false,
  children,
  className,
  density = "collection",
  selected = false,
  tone = "default",
  ...props
}: ScreenRowProps) => {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      {...props}
      className={cn(screenRowVariants({ density, selected, tone }), className)}
      data-density={density}
      data-selected={selected}
      data-screen-row="true"
      data-tone={tone}
    >
      {children}
    </Comp>
  );
};

export const ScreenRowList = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) => (
  <div
    {...props}
    className={cn("border-t border-[var(--screen-line)]", className)}
    data-screen-foundation="row-list"
  />
);

export const ScreenRowMain = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) => (
  <div
    {...props}
    className={cn("grid min-w-0 flex-1 gap-0.5", className)}
    data-screen-row-main
  />
);

export const ScreenRowTitle = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) => (
  <span
    {...props}
    className={cn(
      "min-w-0 wrap-anywhere text-[length:var(--screen-body-size)] leading-[21px] font-semibold",
      className
    )}
    data-screen-row-title
  />
);

export const ScreenRowMeta = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) => (
  <span
    {...props}
    className={cn(
      "min-w-0 wrap-anywhere text-[length:var(--screen-meta-size)] leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]",
      className
    )}
    data-screen-row-meta
  />
);

export const ScreenRowTrailing = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) => (
  <span
    {...props}
    className={cn(
      "flex min-w-0 max-w-[46%] shrink-0 items-center justify-end gap-[var(--screen-utility-gap)]",
      className
    )}
    data-screen-row-trailing
  />
);

const screenStatusVariants = cva(
  "inline-flex min-h-6 w-fit shrink-0 items-center rounded-[var(--screen-radius-pill)] border border-transparent px-[9px] py-0.5 text-xs leading-4 font-bold whitespace-nowrap",
  {
    variants: {
      tone: {
        success:
          "bg-[var(--screen-success-surface)] text-[var(--screen-success)]",
        pending:
          "bg-[var(--screen-pending-surface)] text-[color-mix(in_srgb,var(--screen-pending)_98%,black)]",
        accent: "bg-[var(--screen-accent-soft)] text-[var(--screen-accent)]",
        info: "bg-[var(--screen-info-surface)] text-[var(--screen-info)]",
        neutral: "bg-[var(--screen-surface-soft)] text-[var(--screen-muted)]",
        danger: "bg-[var(--screen-danger-surface)] text-[var(--screen-danger)]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

export type ScreenStatusTone = NonNullable<
  VariantProps<typeof screenStatusVariants>["tone"]
>;

export interface ScreenStatusProps
  extends
    React.ComponentPropsWithoutRef<"span">,
    VariantProps<typeof screenStatusVariants> {}

export const ScreenStatus = ({
  className,
  tone = "neutral",
  ...props
}: ScreenStatusProps) => (
  <Badge
    {...props}
    className={cn(
      screenStatusVariants({ tone }),
      "h-auto min-h-6 w-fit shrink-0 gap-0 overflow-visible rounded-[var(--screen-radius-pill)] px-[9px] py-0.5 text-xs leading-4 font-bold",
      className
    )}
    data-screen-status
    data-tone={tone}
    variant="outline"
  />
);

export type ScreenCardTone = NonNullable<
  VariantProps<typeof screenCardPrimitiveVariants>["tone"]
>;

export interface ScreenCardProps
  extends
    React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof screenCardPrimitiveVariants> {
  asChild?: boolean;
}

/** Semantic containment for one meaningful unit; not a default page wrapper. */
const ScreenCardImpl = (
  {
    asChild = false,
    children,
    className,
    tone = "default",
    ...props
  }: ScreenCardProps,
  ref: React.ForwardedRef<HTMLDivElement>
) => {
  if (asChild) {
    return (
      <Slot.Root
        {...props}
        className={cn(screenCardPrimitiveVariants({ tone }), className)}
        data-slot="card"
        data-screen-card-tone={tone}
        data-screen-foundation="card"
        ref={ref}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <ScreenCardPrimitive
      {...props}
      className={className}
      data-screen-card-tone={tone}
      data-screen-foundation="card"
      tone={tone}
      ref={ref}
    >
      {children}
    </ScreenCardPrimitive>
  );
};

export const ScreenCard = React.forwardRef<HTMLDivElement, ScreenCardProps>(
  ScreenCardImpl
);
ScreenCard.displayName = "ScreenCard";

const screenTaskSurfaceVariants = cva(
  "group/screen-task grid min-h-[92px] content-between gap-[var(--screen-utility-gap)] rounded-[var(--screen-radius-surface)] border border-[var(--screen-line)] bg-[var(--screen-surface)] p-[13px] text-[var(--screen-ink)] no-underline outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[var(--screen-focus)]",
  {
    variants: {
      tone: {
        default: "",
        emphasis: "border-[#d8d0c6] bg-[#fffdfa]",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
);

export interface ScreenTaskSurfaceProps
  extends
    React.ComponentPropsWithoutRef<"div">,
    VariantProps<typeof screenTaskSurfaceVariants> {
  asChild?: boolean;
}

export const ScreenTaskSurface = ({
  asChild = false,
  children,
  className,
  tone = "default",
  ...props
}: ScreenTaskSurfaceProps) => {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      {...props}
      className={cn(screenTaskSurfaceVariants({ tone }), className)}
      data-screen-task-surface="true"
      data-tone={tone}
    >
      {children}
    </Comp>
  );
};

export const ScreenTaskGrid = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) => (
  <div
    {...props}
    className={cn(
      "grid grid-cols-2 gap-[var(--screen-utility-gap)]",
      className
    )}
    data-screen-foundation="task-grid"
  />
);

const screenTabsStatefulContext = React.createContext(false);

export interface ScreenTabsProps extends React.ComponentPropsWithoutRef<"nav"> {
  value?: string;
  onValueChange?: (value: string) => void;
}

export const ScreenTabs = ({
  children,
  className,
  onValueChange,
  role,
  value,
  ...props
}: ScreenTabsProps) => {
  const tabsClassName = cn(
    "flex min-h-[var(--screen-touch-target)] min-w-0 items-stretch overflow-x-auto border-b border-[var(--screen-line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
    className
  );

  if (role !== "tablist") {
    return (
      <nav {...props} className={tabsClassName} data-screen-foundation="tabs">
        {children}
      </nav>
    );
  }

  return (
    <Tabs
      className="contents gap-0"
      onValueChange={onValueChange}
      value={value}
    >
      <TabsList asChild variant="line">
        <nav
          {...props}
          className={tabsClassName}
          data-screen-foundation="tabs"
          role={role}
        >
          <screenTabsStatefulContext.Provider value>
            {children}
          </screenTabsStatefulContext.Provider>
        </nav>
      </TabsList>
    </Tabs>
  );
};

const screenTabVariants = cva(
  "relative inline-flex min-h-[var(--screen-touch-target)] shrink-0 items-center justify-center border-0 bg-transparent px-3.5 text-sm font-bold whitespace-nowrap text-[var(--screen-muted)] no-underline outline-none transition-colors after:absolute after:right-2.5 after:bottom-[-1px] after:left-2.5 after:h-0.5 after:rounded-sm after:bg-[var(--screen-accent)] after:opacity-0 after:transition-opacity hover:text-[var(--screen-ink)] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-[var(--screen-focus)]",
  {
    variants: {
      selected: {
        false: "",
        true: "text-[var(--screen-ink)] after:opacity-100",
      },
    },
    defaultVariants: {
      selected: false,
    },
  }
);

export interface ScreenTabProps
  extends
    React.ComponentPropsWithoutRef<"button">,
    VariantProps<typeof screenTabVariants> {
  asChild?: boolean;
}

export const ScreenTab = ({
  asChild = false,
  children,
  className,
  selected = false,
  type = "button",
  role,
  "aria-selected": ariaSelected,
  value,
  ...props
}: ScreenTabProps) => {
  const isSelected = selected ?? false;
  const isTab = role === "tab";
  const isInStatefulTabs = React.useContext(screenTabsStatefulContext);
  const useTabsPrimitive = !asChild && isTab && isInStatefulTabs;
  const tabValue =
    typeof value === "string" && value.length > 0
      ? value
      : typeof value === "number"
        ? String(value)
        : typeof props.id === "string" && props.id.length > 0
          ? props.id
          : typeof props["aria-controls"] === "string" &&
              props["aria-controls"].length > 0
            ? props["aria-controls"]
            : "screen-tab";
  const sharedProps = {
    ...props,
    "aria-selected": isTab ? (ariaSelected ?? isSelected) : undefined,
    "aria-current": !isTab && isSelected ? ("page" as const) : undefined,
    className: cn(screenTabVariants({ selected: isSelected }), className),
    "data-screen-tab": true,
    "data-selected": isSelected,
    role,
    type,
  };

  if (useTabsPrimitive) {
    return (
      <TabsTrigger {...sharedProps} value={tabValue}>
        {children}
      </TabsTrigger>
    );
  }

  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp {...sharedProps} value={value}>
      {children}
    </Comp>
  );
};

export type ScreenStateKind =
  | "loading"
  | "empty"
  | "error"
  | "forbidden"
  | "not-found";

const screenStateVariants = cva(
  "grid gap-2 py-5 text-sm text-[var(--screen-muted)]",
  {
    variants: {
      kind: {
        loading: "",
        empty: "",
        error: "text-[var(--screen-danger)]",
        forbidden: "text-[var(--screen-danger)]",
        "not-found": "",
      },
    },
    defaultVariants: {
      kind: "empty",
    },
  }
);

export interface ScreenStateProps extends Omit<
  React.ComponentPropsWithoutRef<"div">,
  "title"
> {
  kind: ScreenStateKind;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

/** In-family state locus for loading, empty, forbidden, not-found, and error. */
export const ScreenState = ({
  action,
  children,
  className,
  description,
  kind,
  title,
  ...props
}: ScreenStateProps) => (
  <div
    {...props}
    aria-busy={kind === "loading" ? "true" : undefined}
    className={cn(screenStateVariants({ kind }), className)}
    data-screen-foundation="state"
    data-screen-state={kind}
    role={kind === "error" ? "alert" : "status"}
  >
    <div className="font-bold text-[var(--screen-ink)]">{title}</div>
    {description ? <div>{description}</div> : null}
    {children}
    {action ? <div className="w-fit">{action}</div> : null}
  </div>
);

const screenLoadingRowsVariants = cva("grid", {
  variants: {
    density: {
      collection: "",
      settings: "",
    },
  },
  defaultVariants: {
    density: "collection",
  },
});

export interface ScreenLoadingRowsProps
  extends
    React.ComponentPropsWithoutRef<"output">,
    VariantProps<typeof screenLoadingRowsVariants> {
  count?: number;
  label?: string;
}

export const ScreenLoadingRows = ({
  className,
  count = 3,
  density = "collection",
  label = "載入中",
  ...props
}: ScreenLoadingRowsProps) => (
  <output
    {...props}
    aria-busy="true"
    aria-label={label}
    className={cn(
      screenLoadingRowsVariants({ density }),
      "border-t border-[var(--screen-line)]",
      className
    )}
    data-density={density}
    data-screen-loading-rows
    // eslint-disable-next-line jsx-a11y/no-redundant-roles -- explicit status role keeps the loading contract stable
    role="status"
  >
    {Array.from({ length: count }, (_, index) => (
      <div
        className={cn(
          "grid min-h-[var(--screen-row-min-height)] content-center gap-2 border-b border-[var(--screen-line)] py-[var(--screen-row-padding-block)]",
          density === "settings" &&
            "min-h-[var(--screen-settings-row-min-height)] py-[var(--screen-settings-row-padding-block)]"
        )}
        data-screen-loading-row
        key={index}
      >
        <Skeleton className="h-4 w-2/3 rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
        <Skeleton className="h-3 w-1/2 rounded-[var(--screen-radius-control)] bg-[var(--screen-surface-soft)]" />
      </div>
    ))}
  </output>
);

const ScreenEditorImpl = (
  { className, ...props }: React.ComponentPropsWithoutRef<"form">,
  ref: React.ForwardedRef<HTMLFormElement>
) => (
  <form
    {...props}
    className={cn("grid gap-4", className)}
    data-screen-foundation="editor"
    ref={ref}
  />
);

export const ScreenEditor = React.forwardRef<
  HTMLFormElement,
  React.ComponentPropsWithoutRef<"form">
>(ScreenEditorImpl);
ScreenEditor.displayName = "ScreenEditor";

export interface ScreenFieldProps extends React.ComponentPropsWithoutRef<"fieldset"> {
  label: React.ReactNode;
  htmlFor?: string;
  help?: React.ReactNode;
  error?: React.ReactNode;
}

export const ScreenField = ({
  children,
  className,
  error,
  help,
  htmlFor,
  label,
  ...props
}: ScreenFieldProps) => (
  <Field {...props} className={cn("grid gap-1.5", className)} data-screen-field>
    <FieldLabel className="text-sm font-semibold" htmlFor={htmlFor}>
      {label}
    </FieldLabel>
    {children}
    {help ? (
      <FieldDescription className="text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-muted)]">
        {help}
      </FieldDescription>
    ) : null}
    {error ? (
      <FieldError className="text-xs leading-[var(--screen-meta-leading)] text-[var(--screen-danger)]">
        {error}
      </FieldError>
    ) : null}
  </Field>
);

export const ScreenStickyActions = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) => (
  <div
    {...props}
    className={cn(
      "sticky bottom-[calc(var(--screen-bottom-nav-height)+env(safe-area-inset-bottom,0px))] z-20 mx-[calc(var(--screen-gutter)*-1)] grid grid-cols-[1fr_1.35fr] gap-[var(--screen-utility-gap)] border-t border-[var(--screen-line)] bg-[color-mix(in_srgb,var(--screen-surface)_96%,transparent)] px-[var(--screen-gutter)] py-2.5 shadow-[var(--screen-shadow-sticky)] backdrop-blur-xl min-[800px]:bottom-0 min-[800px]:mx-0",
      className
    )}
    data-screen-foundation="sticky-actions"
    data-testid="screen-sticky-actions"
  />
);
