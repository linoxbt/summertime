// Fallback when no API_URL is configured (for example a front-end-only deploy):
// every API call gets a clear JSON error instead of an HTML 404.
const offline = () =>
  Response.json(
    { error: { code: "BACKEND_OFFLINE", message: "The Summertime demo backend is not connected to this deployment yet." } },
    { status: 503, headers: { "cache-control": "no-store" } },
  );

export const GET = offline;
export const POST = offline;
