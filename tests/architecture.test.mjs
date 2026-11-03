import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { test } from "node:test";

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(dir, item.name)) : /\.tsx?$/.test(item.name) ? [join(dir, item.name)] : []);
}
function importNodes(file) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.filter(ts.isImportDeclaration);
}
function imports(file) {
  return importNodes(file).map(node => node.moduleSpecifier.text);
}
const presentation = () => [...files("src/app"), ...files("src/components")];
test("presentation never imports repositories, the database client or generated Prisma; repositories never depend on presentation/services", () => {
  for (const file of presentation()) {
    for (const name of imports(file)) assert.ok(!/server\/repositories|server\/db|generated\/prisma|@prisma\//.test(name), `${file}: ${name}`);
  }
  for (const file of files("src/server/repositories")) {
    for (const name of imports(file)) assert.ok(!/server\/services|server\/auth|@\/app|@\/components|next\/|next-auth/.test(name), `${file}: ${name}`);
  }
});
test("Business services and Auth/audit contain no Prisma operations or SQL", () => {
  for (const file of [...files("src/server/services"), "src/server/auth/authorization.ts", "src/server/audit.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\.\s*(?:findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|count|aggregate|groupBy|create|createMany|update|updateMany|upsert|delete|deleteMany|\$queryRaw(?:Unsafe)?|\$executeRaw(?:Unsafe)?|\$transaction)\b/, file);
  }
  for (const file of files("src/server/services")) {
    for (const name of imports(file)) assert.doesNotMatch(name, /generated\/prisma|@prisma\//, file);
  }
});
test("presentation calls services only through their database-bound service objects", () => {
  for (const file of presentation()) {
    for (const node of importNodes(file).filter(node => /server\/services\//.test(node.moduleSpecifier.text))) {
      const named = node.importClause?.namedBindings;
      assert.ok(named && ts.isNamedImports(named) && !node.importClause.name, `${file}: use named service imports`);
      for (const item of named.elements) assert.match(item.name.text, /Service$/, `${file}: ${item.name.text}`);
    }
  }
});
test("route handlers leave deactivate/retire rules to services", () => {
  for (const file of files("src/app/api")) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /\{\s*(?:is_active|status)\s*:/, file);
  }
});
