import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import HomePage from "@/app/home/page";
import MessagesPage from "@/app/messages/page";
import NotFoundPage from "@/app/not-found";
import NoticesPage from "@/app/notices/page";
import LoginPage from "@/app/page";
import ProfilePage from "@/app/profile/page";
import SettingsPage from "@/app/profile/settings/page";
import RegisterPage from "@/app/register/page";

import { publicAuthMemberCommunicationsHandlers } from "./public-auth-member-communications-fixtures";

const clearAuthHint = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem("efcc_auth_active");
  window.sessionStorage.removeItem("efcc_session_expired");
};

const withPublicPresentation: Decorator = (Story) => {
  clearAuthHint();
  return <Story />;
};

const withAuthenticatedPresentation: Decorator = (Story) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem("efcc_auth_active", "1");
    window.sessionStorage.removeItem("efcc_session_expired");
  }

  return <Story />;
};

const meta = {
  id: "t07-2-public-auth-member-communications",
  title: "T07.2/Public Auth Member Communications",
  component: LoginPage,
  parameters: {
    a11y: { test: "error" },
  },
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const authenticatedHandlers = publicAuthMemberCommunicationsHandlers;

export const SignIn: Story = {
  decorators: [withPublicPresentation],
  render: () => <LoginPage />,
  parameters: {
    presentation: {
      screenId: "auth-sign-in",
      psn: "PSN-AUTH-SIGN-IN-DEFAULT",
      productFamily: "public-auth-member-communications",
      lifecycle: "active",
      baseline: "primary",
      route: "/",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
    await expect(
      canvas.findByRole("textbox", { name: /用戶名稱|username|user/iu })
    ).resolves.toBeVisible();
  },
};

export const Register: Story = {
  decorators: [withPublicPresentation],
  render: () => <RegisterPage />,
  parameters: {
    presentation: {
      screenId: "auth-register",
      psn: "PSN-AUTH-REGISTER-DEFAULT",
      productFamily: "public-auth-member-communications",
      lifecycle: "active",
      baseline: "primary",
      route: "/register",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/register", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
    await expect(canvas.findByRole("form")).resolves.toBeVisible();
  },
};

export const Home: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <HomePage />,
  parameters: {
    presentation: {
      screenId: "member-home",
      psn: "PSN-MEMBER-HOME-DEFAULT",
      productFamily: "public-auth-member-communications",
      lifecycle: "active",
      baseline: "primary",
      route: "/home",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    msw: authenticatedHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/home", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
  },
};

export const Profile: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <ProfilePage />,
  parameters: {
    presentation: {
      screenId: "member-profile",
      psn: "PSN-MEMBER-PROFILE-DEFAULT",
      productFamily: "public-auth-member-communications",
      lifecycle: "active",
      baseline: "primary",
      route: "/profile",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    msw: authenticatedHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/profile", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
  },
};

export const AccountSettings: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <SettingsPage />,
  parameters: {
    presentation: {
      screenId: "member-account-settings",
      psn: "PSN-MEMBER-ACCOUNT-SETTINGS",
      productFamily: "public-auth-member-communications",
      lifecycle: "active",
      baseline: "primary",
      route: "/profile/settings",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    msw: authenticatedHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/profile/settings", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
  },
};

export const Notices: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <NoticesPage />,
  parameters: {
    presentation: {
      screenId: "communications-notices",
      psn: "PSN-COMMS-NOTICES-DEFAULT",
      productFamily: "public-auth-member-communications",
      lifecycle: "active",
      baseline: "primary",
      route: "/notices",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    msw: authenticatedHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/notices", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
    await expect(canvas.findByRole("list")).resolves.toBeVisible();
  },
};

export const Messages: Story = {
  decorators: [withAuthenticatedPresentation],
  render: () => <MessagesPage />,
  parameters: {
    presentation: {
      screenId: "communications-messages",
      psn: "PSN-COMMS-MESSAGES-DEFAULT",
      productFamily: "public-auth-member-communications",
      lifecycle: "active",
      baseline: "primary",
      route: "/messages",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    msw: authenticatedHandlers,
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/messages", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
    await expect(canvas.findByRole("list")).resolves.toBeVisible();
  },
};

export const NotFound: Story = {
  decorators: [withPublicPresentation],
  render: () => <NotFoundPage />,
  parameters: {
    presentation: {
      screenId: "public-not-found",
      psn: "PSN-PUBLIC-NOT-FOUND",
      productFamily: "public-auth-member-communications",
      lifecycle: "active",
      baseline: "primary",
      route: "/not-found",
      intent: null,
      state: "default",
      gap: null,
      supersedes: [],
    },
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/not-found", query: {} },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole("heading", { level: 1 })
    ).resolves.toBeVisible();
    await expect(canvas.findByRole("link")).resolves.toBeVisible();
  },
};
