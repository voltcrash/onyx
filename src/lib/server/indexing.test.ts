import { describe, expect, it } from "vite-plus/test";
import { SITE_URL } from "#lib/site.ts";
import { isIndexableResponse } from "./indexing.ts";

describe("deployment indexing", () => {
  it("indexes public pages only on the production origin", () => {
    expect(isIndexableResponse(new URL("/?utm_source=test", SITE_URL), 200, "production")).toBe(
      true,
    );
    expect(
      isIndexableResponse(new URL("https://onyx-preview.example.workers.dev/"), 200, "production"),
    ).toBe(false);
  });

  it.each([undefined, "preview", "development"])("excludes the %s environment", (env) => {
    expect(isIndexableResponse(new URL(SITE_URL), 200, env)).toBe(false);
  });

  it("excludes authentication and error responses", () => {
    expect(isIndexableResponse(new URL("/api/auth/get-session", SITE_URL), 200, "production")).toBe(
      false,
    );
    expect(isIndexableResponse(new URL(SITE_URL), 503, "production")).toBe(false);
    expect(isIndexableResponse(new URL("/missing", SITE_URL), 404, "production")).toBe(false);
  });
});
