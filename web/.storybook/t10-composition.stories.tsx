import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageFrame as PageFramePattern } from "@/lib/page-frame";
import { RouteHeader } from "@/lib/route-header";

const meta = {
  id: "t10-composition",
  title: "T10/Composition",
  component: PageFramePattern,
} satisfies Meta<typeof PageFramePattern>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PageFrame: Story = {
  render: () => (
    <PageFramePattern aria-label="T10 Page Frame preview" width="wide">
      <div
        className="grid min-w-0 gap-[var(--space-4)]"
        data-t10-page-frame-content
      >
        <header className="grid min-w-0 gap-2">
          <h1 className="m-0 wrap-anywhere text-3xl font-black text-[var(--ink)]">
            Canonical Page Frame
          </h1>
          <p className="m-0 max-w-[65ch] wrap-anywhere text-[var(--ink-muted)]">
            Long route-level copy stays inside the shared responsive gutter and
            content boundary at narrow and wide widths.
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Deterministic composition content</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 wrap-anywhere">
              This ordinary Playground case uses production PageFrame and
              Surface presentation with synthetic content only.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageFramePattern>
  ),
};

export const RouteHeaderStory: Story = {
  name: "Route Header",
  render: () => (
    <PageFramePattern aria-label="T10 Route Header preview" width="compact">
      <RouteHeader
        action={
          <Button size="lg" type="button" variant="outline">
            儲存已編輯內容
          </Button>
        }
        backHref="/management"
        backLabel="返回管理工作"
        lead="這段 deterministic route-level lead 會在窄視窗換行，讓 header 保持可讀、可操作並且不把 route-specific workflow 帶進共享元件。"
        status={<output>草稿已載入</output>}
        title="一個需要在窄視窗完整換行的路由標題示例"
      />
    </PageFramePattern>
  ),
};
