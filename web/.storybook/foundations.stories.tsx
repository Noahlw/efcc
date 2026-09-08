import type { Meta, StoryObj } from "@storybook/nextjs-vite";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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
