// One SePay test key for every test file. `npm test` runs with --test-isolation=none, where the top-level
// beforeEach hooks of all files run before every test, so per-file keys would overwrite each other and
// turn unrelated tests into 401s depending on file order. Fixture value only, never a real key.
export const SEPAY_TEST_KEY = "sepay-test-key-0123456789";
export const sepayAuth = `Apikey ${SEPAY_TEST_KEY}`;
