import { afterEach, expect, it, vi } from "vite-plus/test";
import { createAuth } from "./auth-options.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("refreshes GitHub App tokens from encrypted cookies after a server restart", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const origin = "https://onyx.test";
  const secret = "test-secret-for-stateless-app-auth-only-123456";
  const cookies = new Map<string, string>();
  const auth = () => createAuth(secret, "app-client", "app-secret", origin);
  const request = async (instance: ReturnType<typeof auth>, path: string, body?: object) => {
    const response = await instance.handler(
      new Request(origin + "/api/auth/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]!;
      const equals = pair.indexOf("=");
      cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
      expect(cookie).not.toContain("initial-access");
      expect(cookie).not.toContain("initial-refresh");
    }
    return response;
  };
  const upstream = vi.fn<typeof fetch>(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    if (url === "https://github.com/login/oauth/access_token") {
      const refresh =
        new URLSearchParams(init?.body as string).get("grant_type") === "refresh_token";
      return Response.json({
        access_token: refresh ? "renewed-access" : "initial-access",
        refresh_token: refresh ? "renewed-refresh" : "initial-refresh",
        expires_in: 28800,
        refresh_token_expires_in: 15897600,
        token_type: "bearer",
        scope: "",
      });
    }
    if (url === "https://api.github.com/user") {
      return Response.json({ id: 42, login: "writer", name: "Writer", email: null });
    }
    if (url === "https://api.github.com/user/emails") {
      return Response.json([{ email: "writer@example.com", primary: true, verified: true }]);
    }
    throw new Error(`Unexpected upstream request: ${url}`);
  });
  vi.stubGlobal("fetch", upstream);
  const first = auth();
  const signIn = await request(first, "sign-in/social", { provider: "github", callbackURL: "/" });
  expect(signIn.status).toBe(200);
  const authorization = new URL((await signIn.json()).url);
  expect(authorization.searchParams.get("scope") || "").toBe("");
  const callback = await request(
    first,
    `callback/github?code=test-code&state=${authorization.searchParams.get("state")}`,
  );
  expect(callback.status).toBe(302);
  expect(callback.headers.get("location")).toBe("/");
  const token = await request(auth(), "get-access-token", { useAccountCookie: true });
  expect(token.status).toBe(200);
  expect((await token.json()).accessToken).toBe("initial-access");

  vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000);
  const refreshed = await request(auth(), "get-access-token", { useAccountCookie: true });
  expect(refreshed.status).toBe(200);
  expect((await refreshed.json()).accessToken).toBe("renewed-access");
  expect(refreshed.headers.getSetCookie().some((value) => value.includes("account_data"))).toBe(
    true,
  );
  const restored = await request(auth(), "get-access-token", { useAccountCookie: true });
  expect((await restored.json()).accessToken).toBe("renewed-access");
  expect(
    upstream.mock.calls.filter(([url]) =>
      (url instanceof Request ? url.url : url.toString()).includes("/access_token"),
    ),
  ).toHaveLength(2);
});
