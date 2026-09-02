import { describe, expect, test } from "vitest";

import type { PlaywrightJsonReport } from "./render-phase-f-evidence";
import {
  parsePlaywrightJsonReport,
  renderEvidenceHtml,
  renderEvidenceJson,
} from "./render-phase-f-evidence";

describe("render-phase-f-evidence", () => {
  const validReport: PlaywrightJsonReport = {
    config: {
      rootDir: "/app",
      metadata: { phaseFTargetUrl: "http://127.0.0.1:8787" },
      projects: [
        {
          name: "w-320",
          use: {
            baseURL: "http://127.0.0.1:8787",
            viewport: { width: 320, height: 844 },
          },
        },
        {
          name: "desktop-800",
          use: {
            baseURL: "http://localhost:4173",
            viewport: { width: 800, height: 900 },
          },
        },
      ],
    },
    suites: [
      {
        title: "tests/e2e/shell-geometry.test.ts",
        file: "tests/e2e/shell-geometry.test.ts",
        specs: [
          {
            title: "shell critical anchors render with no overflow",
            ok: true,
            tests: [
              {
                projectName: "w-320",
                status: "expected",
                results: [
                  {
                    workerIndex: 0,
                    status: "passed",
                    duration: 120,
                    errors: [],
                    attachments: [
                      {
                        name: "shell-geometry",
                        contentType: "application/json",
                        body: JSON.stringify({
                          viewportWidth: 320,
                          viewportHeight: 844,
                          horizontalOverflow: 0,
                          navPosition: "fixed",
                          undersized: [],
                        }),
                      },
                    ],
                  },
                ],
                annotations: [],
              },
              {
                projectName: "desktop-800",
                status: "skipped",
                results: [
                  {
                    workerIndex: 0,
                    status: "skipped",
                    duration: 0,
                    errors: [],
                    attachments: [],
                  },
                ],
                annotations: [
                  {
                    type: "skip",
                    description:
                      "Desktop projects are tested in separate desktop suite.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  test("produces deterministic JSON and preserves item details", () => {
    const items = parsePlaywrightJsonReport(
      validReport,
      "shell-geometry/results.json"
    );
    const fixedDate = "2026-09-01T12:00:00.000Z";
    const json1 = renderEvidenceJson(items, { generatedAt: fixedDate });
    const json2 = renderEvidenceJson(items, { generatedAt: fixedDate });
    expect(json1).toBe(json2);

    const parsed = JSON.parse(json1) as {
      total: number;
      passed: number;
      skipped: number;
      failed: number;
      items: {
        title: string;
        project: string;
        viewport?: { width: number; height: number };
        state: string;
        status: string;
        skipReason?: string;
        numericAttachments: Record<string, unknown>;
      }[];
    };
    expect(parsed.total).toBe(2);
    expect(parsed.passed).toBe(1);
    expect(parsed.skipped).toBe(1);
    expect(parsed.failed).toBe(0);
  });

  test("preserves attachments, state, and viewports in parsed evidence", () => {
    const items = parsePlaywrightJsonReport(
      validReport,
      "shell-geometry/results.json"
    );
    const passedItem = items.find((i) => i.project === "w-320");
    expect(passedItem?.state).toBe("expected");
    expect(passedItem?.status).toBe("passed");
    expect(passedItem?.viewport).toStrictEqual({ width: 320, height: 844 });
    expect(passedItem?.numericAttachments["shell-geometry"]).toStrictEqual({
      viewportWidth: 320,
      viewportHeight: 844,
      horizontalOverflow: 0,
      navPosition: "fixed",
      undersized: [],
    });
  });

  test("preserves skipped item metadata and reasons in parsed evidence", () => {
    const items = parsePlaywrightJsonReport(
      validReport,
      "shell-geometry/results.json"
    );
    const skippedItem = items.find((i) => i.project === "desktop-800");
    expect(skippedItem?.state).toBe("skipped");
    expect(skippedItem?.status).toBe("skipped");
    expect(skippedItem?.skipReason).toBe(
      "Desktop projects are tested in separate desktop suite."
    );
  });

  test("produces accessible and deterministic HTML tables", () => {
    const items = parsePlaywrightJsonReport(
      validReport,
      "shell-geometry/results.json"
    );
    const fixedDate = "2026-09-01T12:00:00.000Z";
    const html1 = renderEvidenceHtml(items, { generatedAt: fixedDate });
    const html2 = renderEvidenceHtml(items, { generatedAt: fixedDate });
    expect(html1).toBe(html2);
    expect(html1).toContain("<!doctype html>");
    expect(html1).toContain('<th scope="col">');
    expect(html1).toContain("shell critical anchors render with no overflow");
    expect(html1).toContain("shell-geometry");
  });

  test("rejects non-loopback target URLs", () => {
    const remoteReport: PlaywrightJsonReport = {
      config: {
        projects: [
          {
            name: "remote-test",
            use: {
              baseURL: "https://remote-production.example.com",
            },
          },
        ],
      },
      suites: [],
    };

    expect(() => parsePlaywrightJsonReport(remoteReport)).toThrow(
      /non-loopback target URL/i
    );
  });

  test("rejects reports without target URL metadata", () => {
    const missingTargetReport: PlaywrightJsonReport = {
      config: { projects: [{ name: "w-320" }] },
      suites: [],
    };

    expect(() => parsePlaywrightJsonReport(missingTargetReport)).toThrow(
      /missing target URL/i
    );
  });

  test("preserves explicit skip reasons across annotations and statuses", () => {
    const skipReport: PlaywrightJsonReport = {
      config: {
        metadata: { phaseFTargetUrl: "http://127.0.0.1:8787" },
        projects: [{ name: "w-600" }],
      },
      suites: [
        {
          title: "suite",
          specs: [
            {
              title: "skipped test with reason",
              tests: [
                {
                  projectName: "w-600",
                  status: "skipped",
                  results: [{ status: "skipped" }],
                  annotations: [
                    {
                      type: "skip",
                      description:
                        "Explicit pin: 600px width is skipped for mobile auth.",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const items = parsePlaywrightJsonReport(skipReport);
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("skipped");
    expect(items[0]?.skipReason).toBe(
      "Explicit pin: 600px width is skipped for mobile auth."
    );
  });

  test("rejects image attachments", () => {
    const imageReport: PlaywrightJsonReport = {
      config: {
        projects: [
          { name: "w-320", use: { baseURL: "http://127.0.0.1:8787" } },
        ],
      },
      suites: [
        {
          title: "suite",
          specs: [
            {
              title: "test with forbidden screenshot",
              tests: [
                {
                  projectName: "w-320",
                  status: "expected",
                  results: [
                    {
                      status: "passed",
                      attachments: [
                        {
                          name: "screenshot",
                          contentType: "image/png",
                          body: "base64-image-bytes",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() => parsePlaywrightJsonReport(imageReport)).toThrow(
      /image attachment/i
    );
  });

  test("rejects malformed JSON attachments", () => {
    const malformedReport: PlaywrightJsonReport = {
      config: {
        projects: [
          { name: "w-320", use: { baseURL: "http://127.0.0.1:8787" } },
        ],
      },
      suites: [
        {
          title: "suite",
          specs: [
            {
              title: "test with malformed JSON",
              tests: [
                {
                  projectName: "w-320",
                  status: "expected",
                  results: [
                    {
                      status: "passed",
                      attachments: [
                        {
                          name: "geometry",
                          contentType: "application/json",
                          body: "not-json",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() => parsePlaywrightJsonReport(malformedReport)).toThrow(
      /malformed JSON attachment/i
    );
  });
});
