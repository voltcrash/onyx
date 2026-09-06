import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { GithubRequestError, githubRequest, restoreGithubSession } from "./github.js";

afterEach(() => vi.unstubAllGlobals());

describe("githubRequest", () => {
  it("retries transient responses and reports long rate-limit windows", async () => {
    const reset = Math.ceil(Date.now() / 1_000) + 3_600;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ accessToken: "token", authenticated: true }))
      .mockResolvedValueOnce(
        Response.json(
          { message: "Service unavailable" },
          { status: 503, headers: { "Retry-After": "0" } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ avatar_url: "avatar", id: 1, login: "onyx", name: null }),
      )
      .mockResolvedValueOnce(
        Response.json(
          { message: "API rate limit exceeded" },
          {
            status: 403,
            headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(reset) },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(restoreGithubSession()).resolves.toMatchObject({ login: "onyx" });
    await expect(githubRequest("/rate-limit")).rejects.toMatchObject({
      status: 403,
      retryAt: new Date(reset * 1_000),
    } satisfies Partial<GithubRequestError>);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
