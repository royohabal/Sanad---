import assert from "node:assert/strict";
import test from "node:test";
import { getPublicAppOrigin } from "./publicAppUrl";

test("production tip links use the stable Vercel project domain", () => {
  assert.equal(
    getPublicAppOrigin(
      {
        forwardedHost: "sanad-preview-abc123.vercel.app",
        forwardedProto: "https",
      },
      {
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "sanad-ranya4.vercel.app",
      },
    ),
    "https://sanad-ranya4.vercel.app",
  );
});

test("non-production links retain their request host", () => {
  assert.equal(
    getPublicAppOrigin(
      {
        forwardedHost: "sanad-git-feature-ranya4.vercel.app",
        forwardedProto: "https",
      },
      {
        VERCEL_ENV: "preview",
        VERCEL_PROJECT_PRODUCTION_URL: "sanad-ranya4.vercel.app",
      },
    ),
    "https://sanad-git-feature-ranya4.vercel.app",
  );
});

test("local links retain the request's forwarded protocol and host", () => {
  assert.equal(
    getPublicAppOrigin(
      {
        forwardedHost: "localhost:26138, proxy.internal",
        forwardedProto: "http, https",
      },
      {},
    ),
    "http://localhost:26138",
  );
});
