export async function fetchNavigation(
  network: () => Promise<Response>,
  cached: () => Promise<Response | undefined>,
): Promise<Response> {
  let response: Response;
  try {
    response = await network();
  } catch {
    return (await cached().catch(() => undefined)) ?? Response.error();
  }
  return response;
}
