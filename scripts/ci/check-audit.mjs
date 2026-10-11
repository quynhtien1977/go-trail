import { exec, execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const BASELINE_PATH = resolve(process.cwd(), ".github/security-audit-baseline.json");

async function main() {
  console.log("==> Loading security audit baseline configuration...");
  let baselineRaw;
  try {
    baselineRaw = await readFile(BASELINE_PATH, "utf8");
  } catch (err) {
    console.error(`ERROR: Failed to read baseline file at ${BASELINE_PATH}: ${err.message}`);
    process.exit(1);
  }

  let baseline;
  try {
    baseline = JSON.parse(baselineRaw);
  } catch (err) {
    console.error(`ERROR: Baseline file is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  const now = new Date();
  const reviewDeadline = new Date(baseline.reviewDeadline);
  if (isNaN(reviewDeadline.getTime())) {
    console.error("ERROR: baseline.reviewDeadline is invalid or missing.");
    process.exit(1);
  }

  if (now > reviewDeadline) {
    console.error(
      `ERROR: Security audit baseline has expired on ${baseline.reviewDeadline}. Current time: ${now.toISOString()}. An active review of dependencies is required.`
    );
    process.exit(1);
  }

  const approvedAdvisories = new Map();
  for (const exp of baseline.exceptions || []) {
    const expExpiry = new Date(exp.expiresAt);
    if (isNaN(expExpiry.getTime()) || now > expExpiry) {
      console.error(
        `ERROR: Exception for ${exp.id} (${exp.package}) expired on ${exp.expiresAt}.`
      );
      process.exit(1);
    }
    approvedAdvisories.set(exp.id, exp);
  }

  console.log(
    `==> Baseline active (review deadline: ${baseline.reviewDeadline}). Approved exceptions: ${approvedAdvisories.size}`
  );

  console.log("==> Running 'npm audit --json'...");
  const auditOutput = await new Promise((resolvePromise) => {
    const handleResult = (err, stdout, stderr) => {
      // npm audit exits with 1 if vulnerabilities are found, which is expected
      if (err && !stdout) {
        console.error(`ERROR: Failed to execute npm audit: ${err.message}`);
        if (stderr) console.error(stderr);
        process.exit(1);
      }
      resolvePromise({ stdout, stderr });
    };

    if (process.platform === "win32") {
      exec("npm.cmd audit --json", { maxBuffer: 10 * 1024 * 1024 }, handleResult);
    } else {
      execFile("npm", ["audit", "--json"], { maxBuffer: 10 * 1024 * 1024 }, handleResult);
    }
  });

  let report;
  try {
    report = JSON.parse(auditOutput.stdout);
  } catch (err) {
    console.error(`ERROR: Failed to parse npm audit JSON output: ${err.message}`);
    if (auditOutput.stderr) console.error("STDERR:", auditOutput.stderr);
    process.exit(1);
  }

  const vulns = report.vulnerabilities || {};
  const metaVulns = report.metadata?.vulnerabilities || {};

  console.log(
    `==> Audit report summary: info=${metaVulns.info || 0}, low=${metaVulns.low || 0}, moderate=${metaVulns.moderate || 0}, high=${metaVulns.high || 0}, critical=${metaVulns.critical || 0}, total=${metaVulns.total || 0}`
  );

  if ((metaVulns.critical || 0) > 0) {
    console.error(`ERROR: Found ${metaVulns.critical} critical vulnerabilities. Critical vulnerabilities cannot be allowed.`);
    process.exit(1);
  }

  const detectedAdvisories = new Map();
  const unexpectedAdvisories = [];

  for (const [pkgName, pkgData] of Object.entries(vulns)) {
    if (!pkgData || !Array.isArray(pkgData.via)) continue;

    for (const viaItem of pkgData.via) {
      if (typeof viaItem === "object" && viaItem !== null && viaItem.url) {
        const ghsaMatch = viaItem.url.match(/(GHSA-[a-zA-Z0-9_-]+)/);
        const ghsaId = ghsaMatch ? ghsaMatch[1] : viaItem.url;

        if (!detectedAdvisories.has(ghsaId)) {
          detectedAdvisories.set(ghsaId, {
            id: ghsaId,
            package: viaItem.name || viaItem.dependency || pkgName,
            title: viaItem.title,
            severity: viaItem.severity,
            url: viaItem.url,
          });
        }
      }
    }
  }

  for (const [ghsaId, adv] of detectedAdvisories.entries()) {
    if (!approvedAdvisories.has(ghsaId)) {
      unexpectedAdvisories.push(adv);
    }
  }

  if (unexpectedAdvisories.length > 0) {
    console.error(`\n❌ ERROR: Detected ${unexpectedAdvisories.length} unapproved or new security vulnerabilities:`);
    for (const adv of unexpectedAdvisories) {
      console.error(`  - [${adv.severity?.toUpperCase()}] ${adv.package}: ${adv.title} (${adv.id}) -> ${adv.url}`);
    }
    console.error("\nPlease review and resolve these vulnerabilities or add approved exceptions to .github/security-audit-baseline.json.");
    process.exit(1);
  }

  console.log(`\n✅ Audit check passed!`);
  console.log(`All ${detectedAdvisories.size} detected root advisories match approved baseline exceptions:`);
  for (const [id] of detectedAdvisories) {
    const exp = approvedAdvisories.get(id);
    console.log(`  - ${id} (${exp.package}): ${exp.reachability}`);
  }
  console.log(`No unapproved high or critical vulnerabilities found. Review deadline: ${baseline.reviewDeadline}`);
}

main().catch((err) => {
  console.error("FATAL: Unexpected error in audit check script:", err);
  process.exit(1);
});
