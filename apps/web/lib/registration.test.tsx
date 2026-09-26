import { cleanup, render, screen } from "@testing-library/react";
// AUTH-05 (#163) — component tests for the self-service registration form.
// MSW intercepts the cookie-only Worker endpoints (the same seam used by
// lib/app.test.tsx). No credential value in fixtures is a real one.
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { QUEUE_COPY, REGISTRATION_COPY } from "./registration-copy";
import { RegistrationForm } from "./registration-form";

const server = setupServer();

async function fillForm(user: UserEvent) {
  await user.type(
    screen.getByLabelText(REGISTRATION_COPY.usernameLabel),
    "dave"
  );
  await user.type(
    screen.getByLabelText(REGISTRATION_COPY.passwordLabel),
    "dave-password-1"
  );
  await user.type(
    screen.getByLabelText(REGISTRATION_COPY.nameLabel),
    "Dave Ng"
  );
  await user.type(
    screen.getByLabelText(REGISTRATION_COPY.phoneLabel),
    "9123 4567"
  );
}

describe(RegistrationForm, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

  test("renders the submit button with the exact 提交註冊申請 label", () => {
    render(<RegistrationForm />);
    expect(
      screen.getByRole("button", { name: "提交註冊申請" })
    ).toBeInTheDocument();
  });

  test("submits the locked register payload with an Idempotency-Key", async () => {
    let captured: {
      method: string;
      headers: Record<string, string>;
      body: Record<string, unknown>;
    } | null = null;
    server.use(
      http.post("/api/v1/auth/register", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        captured = {
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body,
        };
        return HttpResponse.json(
          { requestId: "rid-1", data: { status: "pending" } },
          { status: 200 }
        );
      })
    );
    const user = userEvent.setup();
    render(<RegistrationForm />);
    await fillForm(user);
    await user.click(
      screen.getByRole("button", { name: REGISTRATION_COPY.submit })
    );

    await expect(
      screen.findByText(REGISTRATION_COPY.doneTitle)
    ).resolves.toBeInTheDocument();
    if (captured === null) {
      throw new Error("registration request was not captured");
    }
    expect(captured).toStrictEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "idempotency-key": expect.any(String),
        }),
        body: expect.objectContaining({
          username: "dave",
          password: "dave-password-1",
          name: "Dave Ng",
          phone: "9123 4567",
        }),
      })
    );
  });

  test("shows a deterministic conflict message for a duplicate username", async () => {
    server.use(
      http.post("/api/v1/auth/register", () =>
        HttpResponse.json(
          {
            type: "tag:apps-script/efcc/errors#CONFLICT",
            title: "Conflict",
            status: 409,
            code: "CONFLICT",
            detail: "An account with that username already exists.",
            requestId: "rid-2",
          },
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          }
        )
      )
    );
    const user = userEvent.setup();
    render(<RegistrationForm />);
    await fillForm(user);
    await user.click(
      screen.getByRole("button", { name: REGISTRATION_COPY.submit })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      QUEUE_COPY.conflict
    );
    const username = screen.getByLabelText(REGISTRATION_COPY.usernameLabel);
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(username).toHaveAttribute("aria-describedby", "registration-error");
    expect(username).toHaveFocus();
  });

  test("blocks submission when required fields are missing", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm />);
    await user.click(
      screen.getByRole("button", { name: REGISTRATION_COPY.submit })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      REGISTRATION_COPY.missingFields
    );
  });
  test("focuses the first invalid field and associates its error", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm />);
    await user.click(
      screen.getByRole("button", { name: REGISTRATION_COPY.submit })
    );
    const username = screen.getByLabelText(REGISTRATION_COPY.usernameLabel);
    expect(username).toHaveFocus();
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(username).toHaveAttribute("aria-describedby", "registration-error");
    expect(screen.getByRole("alert")).toHaveTextContent(
      REGISTRATION_COPY.missingFields
    );
  });

  test("preserves completed registration drafts and marks the submit busy", async () => {
    let release: ((response: Response) => void) | undefined;
    server.use(
      http.post(
        "/api/v1/auth/register",
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          })
      )
    );
    const user = userEvent.setup();
    render(<RegistrationForm />);
    await fillForm(user);
    await user.click(
      screen.getByRole("button", { name: REGISTRATION_COPY.submit })
    );
    const submit = screen.getByRole("button", {
      name: REGISTRATION_COPY.submitting,
    });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText(REGISTRATION_COPY.usernameLabel)).toHaveValue(
      "dave"
    );
    release?.(
      HttpResponse.json(
        { requestId: "rid-busy", data: { status: "pending" } },
        { status: 200 }
      )
    );
    await expect(
      screen.findByText(REGISTRATION_COPY.doneTitle)
    ).resolves.toBeInTheDocument();
  });

  test("blocks submission when phone is left blank (now required, not optional)", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm />);
    await user.type(
      screen.getByLabelText(REGISTRATION_COPY.usernameLabel),
      "dave"
    );
    await user.type(
      screen.getByLabelText(REGISTRATION_COPY.passwordLabel),
      "dave-password-1"
    );
    await user.type(
      screen.getByLabelText(REGISTRATION_COPY.nameLabel),
      "Dave Ng"
    );
    await user.click(
      screen.getByRole("button", { name: REGISTRATION_COPY.submit })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      REGISTRATION_COPY.missingFields
    );
  });

  test("blocks submission when password is shorter than 8 characters", async () => {
    const user = userEvent.setup();
    render(<RegistrationForm />);
    await user.type(
      screen.getByLabelText(REGISTRATION_COPY.usernameLabel),
      "dave"
    );
    await user.type(
      screen.getByLabelText(REGISTRATION_COPY.passwordLabel),
      "short"
    );
    await user.type(
      screen.getByLabelText(REGISTRATION_COPY.nameLabel),
      "Dave Ng"
    );
    await user.type(
      screen.getByLabelText(REGISTRATION_COPY.phoneLabel),
      "9123 4567"
    );
    await user.click(
      screen.getByRole("button", { name: REGISTRATION_COPY.submit })
    );

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      REGISTRATION_COPY.missingFields
    );
  });

  test("done screen explains guest check-in still works and links to both destinations", async () => {
    server.use(
      http.post("/api/v1/auth/register", () =>
        HttpResponse.json(
          { requestId: "rid-3", data: { status: "pending" } },
          { status: 200 }
        )
      )
    );
    const user = userEvent.setup();
    render(<RegistrationForm />);
    await fillForm(user);
    await user.click(
      screen.getByRole("button", { name: REGISTRATION_COPY.submit })
    );

    await expect(
      screen.findByText(REGISTRATION_COPY.doneMessage)
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: REGISTRATION_COPY.backToLogin })
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("link", { name: REGISTRATION_COPY.guestCheckIn })
    ).toHaveAttribute("href", "/guest-check-in");
  });
});
