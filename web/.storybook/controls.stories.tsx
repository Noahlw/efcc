import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BellIcon } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import type { ControlPresentationMetadata } from "./presentation-meta";

function controlPresentation(
  controlId: string,
  psn: string,
  state = "contract-gallery"
): ControlPresentationMetadata {
  return {
    subject: "control",
    controlId,
    productFamily: "controls",
    lifecycle: "active",
    baseline: "primary",
    psn,
    route: null,
    intent: null,
    state,
    gap: null,
    supersedes: [],
  };
}

const meta = {
  id: "controls",
  title: "Controls",
  component: Button,
  parameters: {
    a11y: { test: "error" },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ButtonStates: Story = {
  parameters: {
    presentation: controlPresentation("button", "PSN-CONTROL-BUTTON"),
  },
  render: () => (
    <div className="grid max-w-md gap-3">
      <Button>主要動作</Button>
      <Button variant="outline">次要動作</Button>
      <Button variant="destructive">刪除資料</Button>
      <div className="max-w-[14rem]">
        <Button data-testid="t08-button-long-tc">
          這是一個需要安全換行的繁體中文長按鈕標籤
        </Button>
      </div>
      <div className="max-w-[14rem]">
        <Button data-testid="t08-button-long-latin">
          A long Latin action label must wrap safely
        </Button>
      </div>
      <Button disabled>暫不可用</Button>
      <Button aria-busy="true">處理中…</Button>
      <Button aria-label="開啟通知" size="icon">
        <BellIcon aria-hidden="true" />
      </Button>
      <Button asChild variant="link">
        <a href="#button-link">前往連結</a>
      </Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "主要動作" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "暫不可用" })
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "處理中…" })
    ).toHaveAttribute("aria-busy", "true");
    await expect(
      canvas.getByRole("button", { name: "開啟通知" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "前往連結" })
    ).toHaveAttribute("href", "#button-link");
  },
};

export const IconButtonStates: Story = {
  parameters: {
    presentation: controlPresentation("icon-button", "PSN-CONTROL-ICON-BUTTON"),
  },
  render: () => (
    <div className="grid max-w-md gap-3">
      <Button aria-label="開啟通知" size="icon">
        <BellIcon aria-hidden="true" />
      </Button>
      <Button aria-label="停用通知" size="icon" disabled>
        <BellIcon aria-hidden="true" />
      </Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "開啟通知" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "停用通知" })
    ).toBeDisabled();
  },
};

export const InputStates: Story = {
  parameters: {
    presentation: controlPresentation("input", "PSN-CONTROL-INPUT"),
  },
  render: () => (
    <div className="grid max-w-md gap-3">
      <label className="grid gap-1" htmlFor="t08-input-normal">
        <span>使用者名稱</span>
        <Input id="t08-input-normal" placeholder="輸入名稱" />
      </label>
      <label className="grid gap-1" htmlFor="t08-input-long">
        <span>長文字</span>
        <Input
          id="t08-input-long"
          defaultValue="A very long Latin credential value remains a single-line field"
        />
      </label>
      <label className="grid gap-1" htmlFor="t08-input-invalid">
        <span>錯誤欄位</span>
        <Input
          id="t08-input-invalid"
          aria-invalid="true"
          aria-describedby="t08-input-error"
        />
        <span id="t08-input-error">請輸入有效值</span>
      </label>
      <label className="grid gap-1" htmlFor="t08-input-disabled">
        <span>停用欄位</span>
        <Input id="t08-input-disabled" disabled value="不可編輯" readOnly />
      </label>
      <label className="grid gap-1" htmlFor="t08-input-search">
        <span>搜尋欄位</span>
        <Input id="t08-input-search" type="search" placeholder="搜尋活動" />
      </label>
      <label className="grid gap-1" htmlFor="t08-input-password">
        <span>密碼欄位</span>
        <Input id="t08-input-password" type="password" />
      </label>
      <label className="grid gap-1" htmlFor="t08-input-readonly">
        <span>唯讀欄位</span>
        <Input id="t08-input-readonly" readOnly value="只供檢視" />
      </label>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("textbox", { name: "使用者名稱" })
    ).toBeVisible();
    await expect(
      canvasElement.querySelector("#t08-input-invalid")
    ).toHaveAttribute("aria-invalid", "true");
    await expect(
      canvasElement.querySelector("#t08-input-disabled")
    ).toBeDisabled();
    await expect(
      canvas.getByRole("searchbox", { name: "搜尋欄位" })
    ).toBeVisible();
    await expect(canvas.getByLabelText("密碼欄位")).toHaveAttribute(
      "type",
      "password"
    );
    await expect(canvas.getByLabelText("唯讀欄位")).toHaveAttribute("readonly");
  },
};

export const TextareaStates: Story = {
  parameters: {
    presentation: controlPresentation("textarea", "PSN-CONTROL-TEXTAREA"),
  },
  render: () => (
    <div className="grid max-w-md gap-3">
      <label className="grid gap-1" htmlFor="t08-textarea">
        <span>活動描述</span>
        <Textarea
          id="t08-textarea"
          rows={3}
          defaultValue="這是一段較長的繁體中文內容，用來驗證多行欄位可以自然重排。"
          aria-describedby="t08-textarea-hint"
        />
        <span id="t08-textarea-hint">可以繼續輸入詳細說明</span>
      </label>
      <label className="grid gap-1" htmlFor="t08-textarea-invalid">
        <span>錯誤描述</span>
        <Textarea
          id="t08-textarea-invalid"
          aria-invalid="true"
          aria-describedby="t08-textarea-error"
        />
        <span id="t08-textarea-error">請修正活動描述</span>
      </label>
      <label className="grid gap-1" htmlFor="t08-textarea-disabled">
        <span>停用描述</span>
        <Textarea
          id="t08-textarea-disabled"
          disabled
          value="目前不可編輯"
          readOnly
        />
      </label>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvasElement.querySelector("#t08-textarea");
    await expect(textarea).toHaveAttribute("rows", "3");
    await expect(textarea).toHaveAttribute(
      "aria-describedby",
      "t08-textarea-hint"
    );
    await expect(
      canvas.getByRole("textbox", { name: /^錯誤描述/u })
    ).toHaveAttribute("aria-invalid", "true");
    await expect(
      canvas.getByRole("textbox", { name: "停用描述" })
    ).toBeDisabled();
  },
};

export const CheckboxStates: Story = {
  parameters: {
    presentation: controlPresentation("checkbox", "PSN-CONTROL-CHECKBOX"),
  },
  render: () => (
    <form
      aria-label="選取項目表單"
      className="grid gap-3"
      onSubmit={(event) => event.preventDefault()}
    >
      <fieldset className="grid gap-2">
        <legend>選取項目</legend>
        <label className="flex items-center gap-2" htmlFor="t08-checkbox-mixed">
          <Checkbox id="t08-checkbox-mixed" checked="indeterminate" />
          <span>全選目前結果</span>
        </label>
        <label className="flex items-center gap-2" htmlFor="t08-checkbox-row">
          <Checkbox id="t08-checkbox-row" />
          <span>選取目前項目</span>
        </label>
        <label
          className="flex max-w-[18rem] items-start gap-2"
          htmlFor="t08-checkbox-long"
        >
          <Checkbox id="t08-checkbox-long" />
          <span className="min-w-0 wrap-anywhere">
            一個需要安全換行的超長繁體中文項目名稱
          </span>
        </label>
        <label
          className="flex items-center gap-2"
          htmlFor="t08-checkbox-disabled"
        >
          <Checkbox id="t08-checkbox-disabled" disabled />
          <span>停用項目</span>
        </label>
      </fieldset>
    </form>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("checkbox", { name: "全選目前結果" })
    ).toHaveAttribute("aria-checked", "mixed");
    await expect(
      canvas.getByRole("checkbox", { name: "停用項目" })
    ).toBeDisabled();
    await expect(
      canvas.getByRole("form", { name: "選取項目表單" })
    ).toBeInTheDocument();
    const longLabelCheckbox = canvas.getByRole("checkbox", {
      name: "一個需要安全換行的超長繁體中文項目名稱",
    });
    longLabelCheckbox.focus();
    await userEvent.keyboard(" ");
    await expect(longLabelCheckbox).toBeChecked();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "選取目前項目" })
    );
    await expect(
      canvas.getByRole("checkbox", { name: "選取目前項目" })
    ).toBeChecked();
  },
};

export const SwitchStates: Story = {
  parameters: {
    presentation: controlPresentation("switch", "PSN-CONTROL-SWITCH"),
  },
  render: () => (
    <div className="grid gap-3">
      <label className="flex items-center gap-2" htmlFor="t08-switch-on">
        <Switch id="t08-switch-on" defaultChecked />
        <span>啟用通知</span>
      </label>
      <label className="flex items-center gap-2" htmlFor="t08-switch-off">
        <Switch id="t08-switch-off" aria-busy="true" />
        <span>背景同步</span>
      </label>
      <label className="flex items-center gap-2" htmlFor="t08-switch-disabled">
        <Switch id="t08-switch-disabled" disabled />
        <span>受保護設定</span>
      </label>
      <label
        className="flex max-w-[18rem] items-start gap-2"
        htmlFor="t08-switch-long"
      >
        <Switch id="t08-switch-long" />
        <span className="min-w-0 wrap-anywhere">
          一個需要安全換行的超長繁體中文切換設定名稱
        </span>
      </label>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("switch", { name: "啟用通知" })
    ).toBeChecked();
    await expect(
      canvas.getByRole("switch", { name: "背景同步" })
    ).toHaveAttribute("aria-busy", "true");
    await expect(
      canvas.getByRole("switch", { name: "受保護設定" })
    ).toBeDisabled();
    const longLabelSwitch = canvas.getByRole("switch", {
      name: "一個需要安全換行的超長繁體中文切換設定名稱",
    });
    longLabelSwitch.focus();
    await userEvent.keyboard(" ");
    await expect(longLabelSwitch).toBeChecked();
    await userEvent.click(canvas.getByRole("switch", { name: "背景同步" }));
    await expect(
      canvas.getByRole("switch", { name: "背景同步" })
    ).toBeChecked();
  },
};

export const SelectStates: Story = {
  parameters: {
    presentation: controlPresentation("select", "PSN-CONTROL-SELECT"),
  },
  render: () => (
    <label className="grid max-w-xs gap-1" htmlFor="t08-select">
      <span>活動類型</span>
      <Select defaultValue="recurring">
        <SelectTrigger id="t08-select" aria-label="活動類型">
          <SelectValue placeholder="選擇活動類型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recurring">定期活動：每週重複</SelectItem>
          <SelectItem value="one-off">
            一次性活動：A long Latin option label remains readable in the menu
          </SelectItem>
          <SelectItem value="disabled" disabled>
            暫不可選
          </SelectItem>
        </SelectContent>
      </Select>
      <Select defaultValue="one-off">
        <SelectTrigger aria-label="長活動類型">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recurring">定期活動：每週重複</SelectItem>
          <SelectItem value="one-off">
            一次性活動：一個很長的繁體中文選項，以及 readable Latin value
          </SelectItem>
        </SelectContent>
      </Select>
      <Select>
        <SelectTrigger aria-label="未選擇活動類型">
          <SelectValue placeholder="選擇活動類型" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="workshop">Workshop session / 工作坊</SelectItem>
          <SelectItem value="retreat">Retreat / 退修會</SelectItem>
        </SelectContent>
      </Select>
    </label>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: "活動類型" });
    await expect(trigger).toHaveTextContent("定期活動：每週重複");
    await userEvent.click(trigger);
    await expect(
      within(document.body).getByRole("option", {
        name: /一次性活動/u,
      })
    ).toBeVisible();
    await userEvent.click(
      within(document.body).getByRole("option", { name: /一次性活動/u })
    );
    await expect(trigger).toHaveTextContent("一次性活動");
    await expect(
      canvas.getByRole("combobox", { name: "長活動類型" })
    ).toHaveTextContent("一次性活動");
    const placeholder = canvas.getByRole("combobox", {
      name: "未選擇活動類型",
    });
    await expect(placeholder).toHaveTextContent("選擇活動類型");
    await userEvent.click(placeholder);
    const workshop = within(document.body).getByRole("option", {
      name: "Workshop session / 工作坊",
    });
    await userEvent.keyboard("w");
    await expect(workshop).toHaveAttribute("data-highlighted");
    await userEvent.keyboard("{Escape}");
    await expect(placeholder).toHaveAttribute("aria-expanded", "false");
    await expect(placeholder).toHaveFocus();
  },
};
