export type LinkFacts = { href: string; download: boolean; role: string | null; target: string };

/** المسار الذي يأخذنا إليه الرابط إن كان انتقالًا داخليًا يغادر الصفحة الحالية، وإلا لا شيء */
export function leavingPath(link: LinkFacts, here: string): string | null {
  if (link.download || link.role === "tab" || (link.target && link.target !== "_self")) return null;
  let url: URL;
  let current: URL;
  try {
    current = new URL(here);
    url = new URL(link.href, current);
  } catch {
    return null;
  }
  if (url.origin !== current.origin || url.pathname.startsWith("/api/")) return null;
  if (url.pathname === current.pathname && url.search === current.search) return null;
  return url.pathname + url.search;
}
