import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogFooter,
  AlertDialogTrigger,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  ScreenCard,
  ScreenEditor,
  ScreenField,
  ScreenFilterChip,
  ScreenFilters,
  ScreenHeader,
  ScreenIconButton,
  ScreenLoadingRows,
  ScreenPageFrame,
  ScreenRow,
  ScreenRowList,
  ScreenRowMain,
  ScreenRowMeta,
  ScreenRowTitle,
  ScreenRowTrailing,
  ScreenSection,
  ScreenState,
  ScreenStatus,
  ScreenStickyActions,
  ScreenTab,
  ScreenTabs,
  ScreenTaskGrid,
  ScreenTaskSurface,
  ScreenSearch,
} from "@/lib/screen-foundations";

import type { FoundationPresentationMetadata } from "./presentation-meta";

const foundationPresentation = (
  foundationId: string,
  psn: string,
  state: string,
  baseline: FoundationPresentationMetadata["baseline"] = "primary"
): FoundationPresentationMetadata => ({
  subject: "foundation",
  foundationId,
  productFamily: "foundations",
  lifecycle: "active",
  baseline,
  psn,
  route: null,
  intent: null,
  state,
  gap: null,
  supersedes: [],
});

const meta = {
  id: "foundations",
  title: "Foundations",
  component: Card,
  parameters: {
    a11y: { test: "error" },
  },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Surface: Story = {
  parameters: {
    presentation: foundationPresentation(
      "surface",
      "PSN-FOUNDATION-SURFACE",
      "default"
    ),
  },
  render: () => (
    <div
      className="grid min-h-80 w-full max-w-xl gap-3 p-6"
      data-foundation-state="default compact"
    >
      <Card className="w-full" data-testid="foundation-surface-card">
        <CardHeader>
          <CardTitle>資料摘要</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            這是一段較長的繁體中文內容，用來確認共享 surface
            內距與文字換行不會裁切內容。
          </p>
          <p className="mt-3">
            Shared surfaces should keep meaningful long Latin content readable
            without requiring callers to repeat the same border, radius, or
            padding recipe.
          </p>
        </CardContent>
      </Card>
      <Card size="sm" data-testid="foundation-surface-card-sm">
        <CardContent>小型 surface 保留相同的共享 chrome。</CardContent>
      </Card>
    </div>
  ),
};

export const SurfaceCardFooter: Story = {
  parameters: {
    presentation: foundationPresentation(
      "surface",
      "PSN-FOUNDATION-SURFACE-CARD-FOOTER",
      "card-footer-full-bleed",
      "supporting"
    ),
  },
  render: () => (
    <div className="w-full max-w-xl p-6">
      <Card data-testid="foundation-card-footer-card">
        <CardHeader>
          <CardTitle>操作摘要</CardTitle>
        </CardHeader>
        <CardContent>
          Footer chrome should reach the Card boundary without escaping it.
        </CardContent>
        <CardFooter data-testid="foundation-card-footer">
          <span className="min-w-0 flex-1">最後更新：剛剛</span>
          <Button size="sm">查看</Button>
        </CardFooter>
      </Card>
    </div>
  ),
};

const feedbackStates = [
  ["info", "資訊", "這是一般資訊。"],
  ["success", "完成", "操作已完成。"],
  ["pending", "處理中", "資料正在處理。"],
  ["warning", "注意", "請在繼續前確認資料。"],
  ["conflict", "需要確認", "資料已被其他人更新。"],
  ["error", "錯誤", "暫時無法完成操作。"],
] as const;

export const Feedback: Story = {
  parameters: {
    presentation: foundationPresentation(
      "feedback",
      "PSN-FOUNDATION-FEEDBACK",
      "tones-and-announcement-ownership"
    ),
  },
  render: () => (
    <div className="grid w-full max-w-2xl gap-3 p-6">
      {feedbackStates.map(([tone, title, description]) => (
        <Alert
          key={tone}
          tone={tone}
          announcement="none"
          data-testid={`foundation-feedback-${tone}`}
        >
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </Alert>
      ))}
      <div
        className="grid gap-3 border-t border-dashed pt-3"
        data-testid="foundation-feedback-announcement-states"
      >
        <Alert tone="success" announcement="polite">
          <AlertTitle>非緊急狀態</AlertTitle>
          <AlertDescription>使用單一 polite visible owner。</AlertDescription>
        </Alert>
        <Alert tone="error" announcement="assertive">
          <AlertTitle>緊急錯誤</AlertTitle>
          <AlertDescription>
            使用單一 assertive visible owner。
          </AlertDescription>
        </Alert>
        <Alert tone="info" announcement="none">
          <AlertTitle>靜默展示</AlertTitle>
          <AlertDescription>不自動建立 live-region owner。</AlertDescription>
        </Alert>
      </div>
    </div>
  ),
};

const longOverlayCopy = (label: string): ReactNode => (
  <>
    <p>{label} 的內容在窄視窗中仍然可以透過 overlay 內部滾動完整閱讀。</p>
    {Array.from({ length: 48 }, (_, index) => (
      <p key={index}>
        Long overlay content row {index + 1} keeps actions and dismissal
        reachable while the viewport is short.
      </p>
    ))}
  </>
);

type DialogFoundationState = "default" | "long-content" | "busy-disabled";

function DialogFoundationStory({ state }: { state: DialogFoundationState }) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="grid min-h-80 place-items-center p-6"
      data-foundation-state={state}
    >
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button data-testid="dialog-trigger">開啟一般對話框</Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>一般對話框</DialogTitle>
          <DialogDescription asChild>
            <div>
              {state === "long-content" ? (
                longOverlayCopy("對話框")
              ) : (
                <p>確認資料後可以完成這項操作。</p>
              )}
            </div>
          </DialogDescription>
          <DialogFooter className="flex-wrap">
            {state === "busy-disabled" && (
              <Button disabled aria-busy="true">
                儲存中…
              </Button>
            )}
            <Button type="button" onClick={() => setOpen(false)}>
              完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const DialogOverlay: Story = {
  parameters: {
    presentation: foundationPresentation(
      "dialog",
      "PSN-FOUNDATION-DIALOG",
      "default"
    ),
  },
  render: () => <DialogFoundationStory state="default" />,
};

export const DialogLongContent: Story = {
  parameters: {
    presentation: foundationPresentation(
      "dialog",
      "PSN-FOUNDATION-DIALOG-LONG-CONTENT",
      "long-content",
      "supporting"
    ),
  },
  render: () => <DialogFoundationStory state="long-content" />,
};

export const DialogBusyDisabled: Story = {
  parameters: {
    presentation: foundationPresentation(
      "dialog",
      "PSN-FOUNDATION-DIALOG-BUSY-DISABLED",
      "busy-disabled",
      "supporting"
    ),
  },
  render: () => <DialogFoundationStory state="busy-disabled" />,
};

type AlertDialogFoundationState =
  | "review-destructive"
  | "long-content"
  | "busy-disabled";

function AlertDialogFoundationStory({
  state,
}: {
  state: AlertDialogFoundationState;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="grid min-h-80 place-items-center p-6"
      data-foundation-state={state}
    >
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button data-testid="alert-dialog-trigger">開啟確認對話框</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>確認刪除</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              {state === "long-content" ? (
                longOverlayCopy("確認對話框")
              ) : (
                <p>此操作會刪除資料，請確認後再繼續。</p>
              )}
            </div>
          </AlertDialogDescription>
          {state === "review-destructive" && (
            <p data-testid="alert-dialog-review-state">
              review state：請確認所有變更後再繼續。
            </p>
          )}
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel>取消</AlertDialogCancel>
            {state === "busy-disabled" && (
              <Button disabled aria-busy="true">
                處理中…
              </Button>
            )}
            <AlertDialogAction variant="destructive">
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const AlertDialogOverlay: Story = {
  parameters: {
    presentation: foundationPresentation(
      "alert-dialog",
      "PSN-FOUNDATION-ALERT-DIALOG",
      "review-destructive"
    ),
  },
  render: () => <AlertDialogFoundationStory state="review-destructive" />,
};

export const AlertDialogLongContent: Story = {
  parameters: {
    presentation: foundationPresentation(
      "alert-dialog",
      "PSN-FOUNDATION-ALERT-DIALOG-LONG-CONTENT",
      "long-content",
      "supporting"
    ),
  },
  render: () => <AlertDialogFoundationStory state="long-content" />,
};

export const AlertDialogBusyDisabled: Story = {
  parameters: {
    presentation: foundationPresentation(
      "alert-dialog",
      "PSN-FOUNDATION-ALERT-DIALOG-BUSY-DISABLED",
      "busy-disabled",
      "supporting"
    ),
  },
  render: () => <AlertDialogFoundationStory state="busy-disabled" />,
};

type SheetFoundationState = "default" | "long-content" | "busy-disabled";

function SheetFoundationStory({ state }: { state: SheetFoundationState }) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="grid min-h-80 place-items-center p-6"
      data-foundation-state={state}
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button data-testid="sheet-trigger">開啟篩選面板</Button>
        </SheetTrigger>
        <SheetContent side="bottom" showCloseButton={false}>
          <SheetHeader>
            <SheetTitle>篩選條件</SheetTitle>
            <SheetDescription>選擇要顯示的資料。</SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 px-4">
            {state === "long-content" ? (
              longOverlayCopy("側邊面板")
            ) : (
              <p>選擇條件後套用篩選。</p>
            )}
          </div>
          <SheetFooter className="flex-wrap">
            {state === "busy-disabled" && (
              <Button disabled aria-busy="true">
                套用中…
              </Button>
            )}
            <Button type="button" onClick={() => setOpen(false)}>
              套用篩選
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export const SheetOverlay: Story = {
  parameters: {
    presentation: foundationPresentation(
      "sheet",
      "PSN-FOUNDATION-SHEET",
      "default"
    ),
  },
  render: () => <SheetFoundationStory state="default" />,
};

export const SheetLongContent: Story = {
  parameters: {
    presentation: foundationPresentation(
      "sheet",
      "PSN-FOUNDATION-SHEET-LONG-CONTENT",
      "long-content",
      "supporting"
    ),
  },
  render: () => <SheetFoundationStory state="long-content" />,
};

export const SheetBusyDisabled: Story = {
  parameters: {
    presentation: foundationPresentation(
      "sheet",
      "PSN-FOUNDATION-SHEET-BUSY-DISABLED",
      "busy-disabled",
      "supporting"
    ),
  },
  render: () => <SheetFoundationStory state="busy-disabled" />,
};

export const ScreenFoundationsPlayground: Story = {
  parameters: {
    presentation: foundationPresentation(
      "screen-foundations",
      "PSN-SCREEN-FOUNDATIONS-PLAYGROUND",
      "canonical-phone-foundations"
    ),
  },
  render: () => (
    <div className="min-h-dvh bg-[var(--screen-shell-bg)]">
      <ScreenPageFrame width="compact">
        <ScreenHeader
          action={
            <ScreenIconButton aria-label="通知">
              <Bell />
            </ScreenIconButton>
          }
          lead="EFCC 可重用 phone-first UI grammar；數值由 frozen foundation contract 提供。"
          title="Screen Foundations"
        />

        <ScreenSection title="Universal utilities">
          <div className="flex flex-wrap items-center gap-[var(--screen-utility-gap)]">
            <ScreenIconButton aria-label="返回" tone="soft">
              <ChevronLeft />
            </ScreenIconButton>
            <ScreenIconButton aria-label="設定" tone="soft">
              <Settings2 />
            </ScreenIconButton>
            <span className="text-[length:var(--screen-meta-size)] text-[var(--screen-muted)]">
              全部 hit target ≥ 44×44
            </span>
          </div>
        </ScreenSection>

        <ScreenSection title="Search and filters">
          <ScreenSearch aria-label="搜尋課程" placeholder="搜尋課程" />
          <ScreenFilters aria-label="課程篩選">
            <ScreenFilterChip selected>全部</ScreenFilterChip>
            <ScreenFilterChip>可報名</ScreenFilterChip>
            <ScreenFilterChip>已參加</ScreenFilterChip>
            <ScreenFilterChip>待審批</ScreenFilterChip>
          </ScreenFilters>
        </ScreenSection>

        <ScreenSection title="Workspace tabs">
          <ScreenTabs aria-label="課程工作區">
            <ScreenTab asChild selected>
              <a href="#overview">概覽</a>
            </ScreenTab>
            <ScreenTab asChild>
              <a href="#events">聚會</a>
            </ScreenTab>
            <ScreenTab asChild>
              <a href="#participants">參與者</a>
            </ScreenTab>
            <ScreenTab asChild>
              <a href="#settings">設定</a>
            </ScreenTab>
          </ScreenTabs>
        </ScreenSection>

        <ScreenSection title="Status language">
          <div className="flex flex-wrap gap-[var(--screen-utility-gap)]">
            <ScreenStatus tone="success">進行中</ScreenStatus>
            <ScreenStatus tone="pending">待審批</ScreenStatus>
            <ScreenStatus tone="accent">可報名</ScreenStatus>
            <ScreenStatus tone="info">即將開始</ScreenStatus>
            <ScreenStatus tone="neutral">已完成</ScreenStatus>
            <ScreenStatus tone="danger">已取消</ScreenStatus>
          </div>
        </ScreenSection>

        <ScreenSection title="Collection row">
          <ScreenRowList>
            <ScreenRow asChild>
              <a href="#program-one">
                <ScreenRowMain>
                  <ScreenRowTitle>門徒訓練基礎課</ScreenRowTitle>
                  <ScreenRowMeta>培育部 · 恆常課程</ScreenRowMeta>
                </ScreenRowMain>
                <ScreenRowTrailing>
                  <ScreenStatus tone="success">進行中</ScreenStatus>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-[18px] text-[var(--screen-muted)]"
                  />
                </ScreenRowTrailing>
              </a>
            </ScreenRow>
            <ScreenRow asChild>
              <a href="#program-two">
                <ScreenRowMain>
                  <ScreenRowTitle>
                    較長嘅課程名稱可以自然換行而唔鎖死 64px 高度
                  </ScreenRowTitle>
                  <ScreenRowMeta>內容自動增高；64px 只係 minimum</ScreenRowMeta>
                </ScreenRowMain>
                <ScreenRowTrailing>
                  <ScreenStatus tone="pending">待審批</ScreenStatus>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-[18px] text-[var(--screen-muted)]"
                  />
                </ScreenRowTrailing>
              </a>
            </ScreenRow>
          </ScreenRowList>
        </ScreenSection>

        <ScreenSection title="Semantic cards and task surfaces">
          <ScreenCard tone="emphasis">
            <div>
              <strong className="text-base">下一個聚會</strong>
              <p className="m-0 text-[length:var(--screen-meta-size)] text-[var(--screen-muted)]">
                週六 14:00 · 禮堂
              </p>
            </div>
            <div className="grid grid-cols-2 border-y border-[var(--screen-line)]">
              <div className="py-3">
                <span className="block text-xs text-[var(--screen-muted)]">
                  出席
                </span>
                <strong>12 / 18</strong>
              </div>
              <div className="border-l border-[var(--screen-line)] py-3 pl-3">
                <span className="block text-xs text-[var(--screen-muted)]">
                  狀態
                </span>
                <ScreenStatus tone="info">即將開始</ScreenStatus>
              </div>
            </div>
          </ScreenCard>
          <ScreenTaskGrid>
            <ScreenTaskSurface asChild>
              <a href="#events">
                <CalendarDays
                  aria-hidden="true"
                  className="size-5 text-[var(--screen-accent)]"
                />
                <span>
                  <strong className="block text-sm">聚會</strong>
                  <span className="text-xs text-[var(--screen-muted)]">
                    管理課程活動
                  </span>
                </span>
              </a>
            </ScreenTaskSurface>
            <ScreenTaskSurface asChild>
              <a href="#participants">
                <Users
                  aria-hidden="true"
                  className="size-5 text-[var(--screen-accent)]"
                />
                <span>
                  <strong className="block text-sm">參與者</strong>
                  <span className="text-xs text-[var(--screen-muted)]">
                    查看報名狀態
                  </span>
                </span>
              </a>
            </ScreenTaskSurface>
          </ScreenTaskGrid>
        </ScreenSection>

        <ScreenSection title="Focused editor">
          <ScreenEditor aria-label="課程編輯">
            <ScreenField
              help="使用清晰嘅課程名稱。"
              htmlFor="playground-program-name"
              label="課程名稱"
            >
              <Input
                defaultValue="門徒訓練基礎課"
                id="playground-program-name"
              />
            </ScreenField>
            <ScreenField
              help="用簡短句子描述課程內容。"
              htmlFor="playground-program-description"
              label="課程描述"
            >
              <Textarea
                className="min-h-[104px] w-full resize-y rounded-[var(--screen-radius-control)] border border-[var(--screen-line-strong)] bg-[var(--screen-surface)] p-3 text-[var(--screen-ink)] outline-none focus-visible:border-[var(--screen-focus)] focus-visible:ring-3 focus-visible:ring-[var(--screen-focus)]/20"
                defaultValue="以日常操練、同行分享同小組實踐建立穩定信仰生活。"
                id="playground-program-description"
              />
            </ScreenField>
            <ScreenStickyActions>
              <Button variant="outline">取消變更</Button>
              <Button>儲存</Button>
            </ScreenStickyActions>
          </ScreenEditor>
        </ScreenSection>
      </ScreenPageFrame>
    </div>
  ),
};

export const ScreenFoundationsStates: Story = {
  parameters: {
    presentation: foundationPresentation(
      "screen-foundations-states",
      "PSN-SCREEN-FOUNDATIONS-STATES",
      "loading-empty-error",
      "supporting"
    ),
  },
  render: () => (
    <div className="min-h-dvh bg-[var(--screen-shell-bg)]">
      <ScreenPageFrame width="compact">
        <ScreenHeader
          lead="狀態留喺自然嘅 family locus，唔用一張巨大 error card 取代所有情況。"
          title="狀態 grammar"
        />
        <ScreenSection title="Loading rows">
          <ScreenLoadingRows />
        </ScreenSection>
        <ScreenSection title="Empty and recovery">
          <ScreenState
            description="目前沒有符合條件嘅資料。"
            kind="empty"
            title="暫時未有資料"
          />
          <ScreenState
            action={<Button variant="outline">重試</Button>}
            description="可以保留目前 route context 再次載入。"
            kind="error"
            title="載入失敗"
          />
        </ScreenSection>
        <ScreenSection title="Accessible identity">
          <ScreenCard>
            <div className="flex items-start gap-3">
              <ShieldCheck
                aria-hidden="true"
                className="size-5 text-[var(--screen-accent)]"
              />
              <div>
                <strong className="block">語意由 route / domain 提供</strong>
                <p className="m-0 text-sm text-[var(--screen-muted)]">
                  Foundation fixture 只展示 presentation seam，唔代表
                  authorization 或 server truth。
                </p>
              </div>
            </div>
          </ScreenCard>
          <div className="flex items-center gap-2 text-sm text-[var(--screen-muted)]">
            <Pencil aria-hidden="true" className="size-4" />
            editor copy remains synthetic
          </div>
        </ScreenSection>
      </ScreenPageFrame>
    </div>
  ),
};
