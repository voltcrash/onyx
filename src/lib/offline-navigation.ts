export async function fetchNavigation(
  network: () => Promise<Response>,
  cached: () => Promise<Response | undefined>,
  preferCache = false,
): Promise<Response> {
  if (preferCache) {
    const shell = await cached().catch(() => undefined);
    if (shell) return shell;
  }
  let response: Response;
  try {
    response = await network();
  } catch {
    return (await cached().catch(() => undefined)) ?? Response.error();
  }
  return response;
}
