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
}

describe(RegistrationForm, () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => {
    cleanup();
    server.resetHandlers();
  });

  afterAll(() => server.close());

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
});
