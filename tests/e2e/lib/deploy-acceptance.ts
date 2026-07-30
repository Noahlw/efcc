/**
 * Deployment CLI seam for EFCC E2E acceptance pipeline.
 *
 * Interface (deep module):
 * - buildDeployPlan(opts) -> DeployPlan  (pure, testable)
 * - buildExecUrl(deploymentId) -> string  (pure, testable)
 * - validateExecUrl(url, expectedDeploymentId) -> void  (pure, testable)
 * - runDeploy(plan) -> DeployResult  (side-effecting, accepts deps as params)
 *
 * Seam: the clasp CLI boundary. Tests cross the same seam as CI callers.
 * Depth: clasp command construction, version capture, URL building,
 *        provenance verification all hidden behind a small interface.
 *
 * Doc evidence: Context7 clasp guide:
 *   clasp push --force   (push source when repo is source of truth)
 *   clasp version [desc] (create immutable version, prints version number)
 *   clasp redeploy <deploymentId> <version> <description>
 */

export interface DeployPlanInput {
  commitSha: string;
  deploymentId: string;
  scriptId: string;
}

export interface DeployPlan {
  pushCmd: string[];
  versionCmd: string[];
  redeployCmdTemplate: string;
  execUrl: string;
}

export interface DeployResult {
  execUrl: string;
  version: number;
  deploymentId: string;
  commitSha: string;
  timestamp: string;
}

const EXEC_URL_PREFIX = "https://script.google.com/macros/s/";
const EXEC_URL_SUFFIX = "/exec";
const EXEC_URL_REGEX =
  /^https:\/\/script\.google\.com\/macros\/s\/(?<deploymentId>AK[a-zA-Z0-9_-]+)\/exec$/u;

export function buildExecUrl(deploymentId: string): string {
  return `${EXEC_URL_PREFIX}${deploymentId}${EXEC_URL_SUFFIX}`;
}

export function buildDeployPlan(opts: DeployPlanInput): DeployPlan {
  if (!opts.commitSha) {
    throw new Error("commitSha is required");
  }
  if (!opts.deploymentId) {
    throw new Error("deploymentId is required");
  }

  return {
    pushCmd: ["clasp", "push", "--force"],
    versionCmd: ["clasp", "version", opts.commitSha],
    redeployCmdTemplate: `clasp redeploy ${opts.deploymentId} {version} acceptance ${opts.commitSha}`,
    execUrl: buildExecUrl(opts.deploymentId),
  };
}

export function validateExecUrl(
  url: string,
  expectedDeploymentId: string
): void {
  const match = url.match(EXEC_URL_REGEX);
  if (!match) {
    throw new Error(
      `E2E_TARGET_URL must be a Google Apps Script /exec URL (got: ${url})`
    );
  }
  const actualDeploymentId = match.groups?.deploymentId;
  if (actualDeploymentId !== expectedDeploymentId) {
    throw new Error(
      `Deployment ID mismatch: expected ${expectedDeploymentId}, got ${actualDeploymentId}`
    );
  }
}
