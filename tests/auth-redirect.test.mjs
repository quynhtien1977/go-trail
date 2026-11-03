import assert from "node:assert/strict";
import { test } from "node:test";
import { getSafeAuthCallback } from "../src/lib/auth-redirect.ts";

const origin = "https://go-trail.example.test";
test("Auth callbacks preserve internal deep links, including Auth.js absolute same-origin URLs", () => {
  for (const path of ["/account", "/leader?view=upcoming#trips", "/", "/account?next=https%3A%2F%2Fexample.test"]) {
    assert.equal(getSafeAuthCallback(path, origin), path);
    assert.equal(getSafeAuthCallback(origin + path, origin), path);
  }
});

test("Auth callbacks reject external URLs and browser-normalized authority tricks", () => {
  for (const value of [null, "", "https://evil.example.test", "//evil.example.test", "/\\evil.example.test", "/\\\\evil.example.test",
    "javascript:alert(1)", "data:text/html,test", " /account", "/\tevil.example.test", "/\nevil.example.test",
    origin + "//evil.example.test", "/%2f%2fevil.example.test", "/%5cevil.example.test", "https://user@go-trail.example.test/account"]) {
    assert.equal(getSafeAuthCallback(value, origin), null, JSON.stringify(value));
  }
});
