import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { test } from "node:test";

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(dir, item.name)) : /\.tsx?$/.test(item.name) ? [join(dir, item.name)] : []);
}
function imports(file) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.filter(ts.isImportDeclaration).map(node => node.moduleSpecifier.text);
}
test("presentation never imports repositories or generated Prisma; repositories never depend on presentation/services", () => {
  for (const file of [...files("src/app"), ...files("src/components")]) {
    for (const name of imports(file)) assert.ok(!/server\/repositories|generated\/prisma/.test(name), `${file}: ${name}`);
  }
  for (const file of files("src/server/repositories")) {
    for (const name of imports(file)) assert.ok(!/server\/services|server\/auth|@\/app|@\/components|next\/|next-auth/.test(name), `${file}: ${name}`);
  }
});
test("Auth business services contain no Prisma model operations or SQL", () => {
  for (const file of ["src/server/services/accounts.ts", "src/server/services/account-data.ts", "src/server/auth/authorization.ts", "src/server/audit.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\b(?:db|tx)\.(?:user|staff|invoice|departure|auditLog|\$queryRaw|\$executeRaw|\$transaction)\b/, file);
  }
});
