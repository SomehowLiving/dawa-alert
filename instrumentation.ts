// Runs once when the server starts: warm the two expensive reads so the first visitor does not wait for them.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { getApi } = await import("./lib/deps")
  const api = getApi()
  void api.request("/api/stats").catch(() => {})
  void api.request("/api/recent").catch(() => {})
}
