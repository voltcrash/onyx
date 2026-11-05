export async function fetchNavigation(
  network: () => Promise<Response>,
  cached: () => Promise<Response | undefined>,
  remember: (response: Response) => Promise<void>,
): Promise<Response> {
  let response: Response;
  try {
    response = await network();
  } catch {
    return (await cached().catch(() => undefined)) ?? Response.error();
  }
  if (response.ok) await remember(response.clone()).catch(() => undefined);
  return response;
}
