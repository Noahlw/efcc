import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  buildDeployPlan,
  buildExecUrl,
  validateExecUrl,
} from "./deploy-acceptance";

describe(buildDeployPlan, () => {
  test("returns correct clasp commands for a commit SHA and deployment ID", () => {
    const plan = buildDeployPlan({
      commitSha: "abc1234",
      deploymentId: "AKfycbx_test_deployment_id",
      scriptId: "1AbcDef_script_id",
    });

    assert.deepEqual(plan.pushCmd, ["clasp", "push", "--force"]);
    assert.deepEqual(plan.versionCmd, ["clasp", "version", "abc1234"]);
    assert.equal(
      plan.redeployCmdTemplate,
      "clasp redeploy AKfycbx_test_deployment_id {version} acceptance abc1234"
    );
    assert.equal(
      plan.execUrl,
      "https://script.google.com/macros/s/AKfycbx_test_deployment_id/exec"
    );
  });

  test("throws if commitSha is empty", () => {
    assert.throws(
      () =>
        buildDeployPlan({
          commitSha: "",
          deploymentId: "AK_test",
          scriptId: "1_test",
        }),
      /commitSha/u
    );
  });

  test("throws if deploymentId is empty", () => {
    assert.throws(
      () =>
        buildDeployPlan({
          commitSha: "abc1234",
          deploymentId: "",
          scriptId: "1_test",
        }),
      /deploymentId/u
    );
  });
});

describe(buildExecUrl, () => {
  test("constructs a valid /exec URL from a deployment ID", () => {
    const url = buildExecUrl("AKfycbx_test_deployment_id");
    assert.equal(
      url,
      "https://script.google.com/macros/s/AKfycbx_test_deployment_id/exec"
    );
  });
});

describe(validateExecUrl, () => {
  test("accepts a valid /exec URL matching the expected deployment ID", () => {
    const url =
      "https://script.google.com/macros/s/AKfycbx_test_deployment_id/exec";
    assert.doesNotThrow(() =>
      validateExecUrl(url, "AKfycbx_test_deployment_id")
    );
  });

  test("throws if the URL is not a /exec URL", () => {
    assert.throws(
      () => validateExecUrl("https://example.com", "AK_test"),
      /exec URL/u
    );
  });

  test("throws if the deployment ID does not match", () => {
    const url = "https://script.google.com/macros/s/AKfycbx_other/exec";
    assert.throws(
      () => validateExecUrl(url, "AKfycbx_expected"),
      /Deployment ID/iu
    );
  });
});
