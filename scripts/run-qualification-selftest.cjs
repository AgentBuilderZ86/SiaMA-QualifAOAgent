// Runner pour le self-test compilé en CommonJS dans .tmp-test
// 1. Compile via tsconfig.test.json
// 2. Charge le module avec un alias @/ -> .tmp-test/

const path = require("node:path");
const Module = require("node:module");

const tmpRoot = path.resolve(__dirname, "..", ".tmp-test");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patched(request, parent, ...rest) {
  if (typeof request === "string" && request.startsWith("@/")) {
    const resolved = path.join(tmpRoot, request.slice(2));
    return originalResolve.call(this, resolved, parent, ...rest);
  }
  return originalResolve.call(this, request, parent, ...rest);
};

const testModule = require(path.join(tmpRoot, "lib", "qualification", "intelligence.test.js"));

try {
  testModule.runQualificationIntelligenceSelfTest();
  console.log("[OK] Qualification intelligence self-test V9");
  process.exit(0);
} catch (error) {
  console.error("[FAIL]", error && error.message ? error.message : error);
  if (error && error.stack) console.error(error.stack);
  process.exit(1);
}
