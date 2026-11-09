import { expect, test } from "@playwright/test";

test("serves an anonymous session from the Workers auth handler", async ({ request }) => {
  const response = await request.get("/api/auth/get-session");
  expect(response.status()).toBe(200);
  expect(await response.json()).toBeNull();
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
});

test("starts GitHub OAuth with a signed state cookie and the local callback", async ({
  request,
  baseURL,
}) => {
  const response = await request.post("/api/auth/sign-in/social", {
    headers: { Origin: baseURL! },
    data: { provider: "github", callbackURL: `${baseURL}/` },
  });
  expect(response.status()).toBe(200);
  const { url } = await response.json();
  const authorization = new URL(url);
  expect(authorization.origin).toBe("https://github.com");
  expect(authorization.searchParams.get("redirect_uri")).toBe(
    `${baseURL}/api/auth/callback/github`,
  );
  expect(authorization.searchParams.get("scope")?.split(" ")).toContain("repo");
  expect(response.headers()["set-cookie"]).toContain("onyx.");
  expect(response.headers()["set-cookie"]).toContain("HttpOnly");
});

test("rejects OAuth initiation from another origin", async ({ request }) => {
  const response = await request.post("/api/auth/sign-in/social", {
    headers: { Origin: "https://untrusted.example" },
    data: { provider: "github", callbackURL: "https://untrusted.example/" },
  });
  expect(response.status()).toBe(403);
});
