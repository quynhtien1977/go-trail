import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAuditReport } from "../scripts/ci/check-audit.mjs";

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
