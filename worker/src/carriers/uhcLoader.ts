/** Reload only downloader code, keeping authentication in the owning portal adapter. */
export async function loadUhcDownloader() {
  const moduleUrl = new URL("./uhcDownload.js", import.meta.url);
  moduleUrl.searchParams.set("retry", String(Date.now()));
  return import(moduleUrl.href) as Promise<typeof import("./uhcDownload.js")>;
}
