import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useEffect } from "react";

import {
  useAsyncResource,
  type AsyncResourceOptions,
} from "@/lib/programs/use-async-resource";

const announceMock = vi.hoisted(() => vi.fn<(message: string) => void>());

vi.mock("@/lib/live-region", () => ({
  announce: announceMock,
}));

type State =
  | { kind: "loading" }
  | { kind: "ready"; value: string }
  | { kind: "error"; message: string };

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

type AsyncRequest = { cancelled: boolean };

type HarnessProps = {
  load: (request?: AsyncRequest) => Promise<string>;
  options?: Partial<AsyncResourceOptions<string, State>>;
  initialRequest?: AsyncRequest;
};
const LifecycleHarness = ({
  load,
  options,
  initialRequest,
}: HarnessProps) => {
  const { state, run, retry } = useAsyncResource<string, State>(
    load,
    {
      toLoading: () => ({ kind: "loading" }),
      toReady: (value) => ({ kind: "ready", value }),
      onError: () => ({ kind: "error", message: "載入失敗" }),
      ...options,
    },
    []
  );

  useEffect(() => {
    void run(initialRequest);
  }, [run, initialRequest]);

  const handleLoad = () => {
    void run();
  };
  const handleRetry = () => {
    retry();
  };

  return (
    <section>
      <p data-testid="state">
        {state.kind === "ready" ? `${state.kind}:${state.value}` : state.kind}
      </p>
      <button type="button" onClick={handleLoad}>
        載入
      </button>
      <button type="button" onClick={handleRetry}>
        重試
      </button>
      <div id="retry-target" tabIndex={-1}>
        retry target
      </div>
    </section>
  );
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  announceMock.mockReset();
});

describe(useAsyncResource, () => {
  test("drops stale results when a newer request settles first", async () => {
    const requests: Deferred<string>[] = [];
    const load = vi.fn(() => {
      const request = deferred<string>();
      requests.push(request);
      return request.promise;
    });
    const user = userEvent.setup();

    render(<LifecycleHarness load={load} />);
    await waitFor(() => expect(requests).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "載入" }));
    expect(requests).toHaveLength(2);

    requests[1].resolve("new");
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready:new"));
    requests[0].resolve("old");
    await Promise.resolve();
    expect(screen.getByTestId("state")).toHaveTextContent("ready:new");
  });

  test("focuses the configured error target after a retry fails", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"));
    const user = userEvent.setup();

    render(
      <LifecycleHarness
        load={load}
        options={{ focusTarget: "#retry-target" }}
      />
    );
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("error"));
    await user.click(screen.getByRole("button", { name: "重試" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("error"));
    expect(screen.getByRole("button", { name: "重試" })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByText("retry target"));
  });

  test("announces loading, ready, and one configured error message", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("ready")
      .mockRejectedValueOnce(new Error("failed"));
    const user = userEvent.setup();

    render(
      <LifecycleHarness
        load={load}
        options={{
          announceLoading: "正在載入…",
          announceReady: (value) => `已載入 ${value}`,
          announceError: () => "載入失敗，請重試。",
        }}
      />
    );
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("ready:ready"));
    expect(announceMock).toHaveBeenNthCalledWith(1, "正在載入…");
    expect(announceMock).toHaveBeenNthCalledWith(2, "已載入 ready");

    await user.click(screen.getByRole("button", { name: "重試" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("error"));
    expect(announceMock).toHaveBeenNthCalledWith(3, "正在載入…");
    expect(announceMock).toHaveBeenNthCalledWith(4, "載入失敗，請重試。");
  });

  test("hands AUTH_REQUIRED to the route-owned deep-link callback", async () => {
    const authError = { code: "AUTH_REQUIRED" };
    const onAuthRequired = vi.fn();
    const load = vi.fn(() => Promise.reject(authError));

    render(
      <LifecycleHarness
        load={load}
        options={{
          isAuthRequired: (error) => error === authError,
          onAuthRequired,
        }}
      />
    );

    await waitFor(() => expect(onAuthRequired).toHaveBeenCalledWith(authError));
    expect(screen.getByTestId("state")).toHaveTextContent("loading");
  });

  test("ignores a cancelled request even when it resolves", async () => {
    const requestToken: AsyncRequest = { cancelled: false };
    const request = deferred<string>();
    const load = vi.fn((token?: AsyncRequest) => {
      expect(token).toBe(requestToken);
      return request.promise;
    });

    render(
      <LifecycleHarness load={load} initialRequest={requestToken} />
    );
    await waitFor(() => expect(load).toHaveBeenCalled());
    requestToken.cancelled = true;
    request.resolve("cancelled");
    await Promise.resolve();
    expect(screen.getByTestId("state")).toHaveTextContent("loading");
  });
});
