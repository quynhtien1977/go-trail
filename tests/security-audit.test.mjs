import assert from "node:assert/strict";
import { test } from "node:test";
import { isApprovedAdvisory, parseAuditReport } from "../scripts/ci/check-audit.mjs";

function report(vulnerabilities = {}, counts = {}) {
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...counts } },
  };
}

test("audit accepts a complete registry report, including known vulnerability details", () => {
  const input = report({ braces: { severity: "high", via: [{ url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }] } }, { high: 1, total: 1 });
  assert.deepEqual(parseAuditReport(JSON.stringify(input)), input);
  assert.deepEqual(parseAuditReport(JSON.stringify(report())), report());
});

test("audit rejects registry errors and incomplete reports instead of treating them as zero findings", () => {
  for (const input of [{ error: { code: "ENOTCACHED" } }, {}, { vulnerabilities: {} }, { ...report(), error: { code: "E503" } }]) {
    assert.throws(() => parseAuditReport(JSON.stringify(input)), /Invalid npm audit report/);
  }
  assert.throws(() => parseAuditReport("not json"), /Invalid npm audit report/);
});

test("audit rejects missing, negative, nonnumeric or inconsistent vulnerability counts", () => {
  for (const counts of [{ high: undefined }, { high: -1 }, { high: "0" }, { high: 1.5 }, { high: 1, total: 0 }]) {
    assert.throws(() => parseAuditReport(JSON.stringify(report({}, counts))), /Invalid npm audit report/);
  }
  for (const vulnerabilities of [null, [], "unavailable"]) {
    assert.throws(() => parseAuditReport(JSON.stringify(report(vulnerabilities))), /Invalid npm audit report/);
  }
});

const advisory = { id: "GHSA-example", package: "minimatch" };
const exception = { id: advisory.id, package: "minimatch", allowedVersions: ["3.1.5"] };
const affected = (nodes = ["node_modules/minimatch"]) => ({ vulnerabilities: { minimatch: { nodes } } });
const lock = (version = "3.1.5") => ({ packages: { "node_modules/minimatch": { version } } });

test("a version-scoped exception accepts only the approved locked package version", () => {
  assert.equal(isApprovedAdvisory(advisory, exception, affected(), lock()), true);
  assert.equal(isApprovedAdvisory(advisory, exception, affected(), lock("10.2.6")), false);
  assert.equal(isApprovedAdvisory(advisory, exception, affected(), lock("3.1.6")), false);
});

test("an approved legacy version cannot hide an affected modern nested copy", () => {
  const nested = "node_modules/consumer/node_modules/minimatch";
  const mixed = lock(); mixed.packages[nested] = { version: "10.2.6" };
  assert.equal(isApprovedAdvisory(advisory, exception, affected(["node_modules/minimatch", nested]), mixed), false);
});

test("scoped exceptions fail closed without complete matching advisory and lockfile evidence", () => {
  for (const input of [undefined, {}, { packages: {} }]) {
    assert.equal(isApprovedAdvisory(advisory, exception, affected(), input), false);
  }
  for (const nodes of [[], undefined, "node_modules/minimatch", ["missing"], [null]]) {
    const report = { vulnerabilities: { minimatch: { nodes } } };
    assert.equal(isApprovedAdvisory(advisory, exception, report, lock()), false);
  }
  for (const allowedVersions of [[], null, "3.1.5", [""], [null]]) {
    assert.equal(isApprovedAdvisory(advisory, { ...exception, allowedVersions }, affected(), lock()), false);
  }
  assert.equal(isApprovedAdvisory(advisory, { ...exception, id: "other" }, affected(), lock()), false);
  assert.equal(isApprovedAdvisory(advisory, { ...exception, package: "other" }, affected(), lock()), false);
});

test("existing unscoped approvals retain their behavior while unknown advisories remain blocked", () => {
  assert.equal(isApprovedAdvisory(advisory, { id: advisory.id, package: advisory.package }, affected()), true);
  assert.equal(isApprovedAdvisory(advisory, undefined, affected(), lock()), false);
});
