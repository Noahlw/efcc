import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { FoundationPresentationMetadata } from "./presentation-meta";

const foundationPresentation = (
  foundationId: string,
  psn: string,
  state: string
): FoundationPresentationMetadata => ({
  subject: "foundation",
  foundationId,
  productFamily: "foundations",
  lifecycle: "active",
  baseline: "primary",
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
    <div className="grid min-h-80 w-full max-w-xl place-items-center p-6">
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

export const DialogOverlay: Story = {
  parameters: {
    presentation: foundationPresentation(
      "dialog",
      "PSN-FOUNDATION-DIALOG",
      "long-content"
    ),
  },
  render: () => (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogTitle>一般對話框</DialogTitle>
        <DialogDescription asChild>
          <div>{longOverlayCopy("對話框")}</div>
        </DialogDescription>
        <DialogFooter>
          <Button>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const AlertDialogOverlay: Story = {
  parameters: {
    presentation: foundationPresentation(
      "alert-dialog",
      "PSN-FOUNDATION-ALERT-DIALOG",
      "long-content"
    ),
  },
  render: () => (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogTitle>確認刪除</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div>{longOverlayCopy("確認對話框")}</div>
        </AlertDialogDescription>
        <AlertDialogFooter>
          <Button variant="outline">取消</Button>
          <Button variant="destructive">確認</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};

export const SheetOverlay: Story = {
  parameters: {
    presentation: foundationPresentation(
      "sheet",
      "PSN-FOUNDATION-SHEET",
      "long-content"
    ),
  },
  render: () => (
    <Sheet open>
      <SheetContent side="right" showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>篩選條件</SheetTitle>
          <SheetDescription>選擇要顯示的資料。</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-4">{longOverlayCopy("側邊面板")}</div>
        <SheetFooter>
          <Button>套用篩選</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
