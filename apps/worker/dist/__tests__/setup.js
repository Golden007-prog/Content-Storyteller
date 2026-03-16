"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const gcp_1 = require("../config/gcp");
// Reset the GCP config singleton before each test to avoid stale state
(0, vitest_1.beforeEach)(() => {
    (0, gcp_1._resetConfigForTesting)();
});
//# sourceMappingURL=setup.js.map