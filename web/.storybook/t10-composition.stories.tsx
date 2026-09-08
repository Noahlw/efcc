import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageFrame as PageFramePattern } from "@/lib/page-frame";

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
