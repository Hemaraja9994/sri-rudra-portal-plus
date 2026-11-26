// Passing requests on to the admin portal, and adding the theme to its HTML pages.

import { patchCategories } from './categories.js';

const THEME_VERSION = '2026-11-13c';

// Added to the <head> of every portal page: the app manifest and icons (so it can be installed),
// a one-line catcher for the browser's install offer, then the theme and the two small scripts.
const HEAD_TAGS = [
  '<link rel="manifest" href="/__srr/app.webmanifest">',
  '<link rel="icon" type="image/png" sizes="32x32" href="/__srr/icons/favicon-32.png">',
  '<link rel="apple-touch-icon" href="/__srr/icons/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Sri Rudra">',
  '<script>addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__srrInstallEvent=e});</script>',
  `<link rel="stylesheet" href="/__srr/theme.css?v=${THEME_VERSION}">`,
  `<script src="/__srr/install.js?v=${THEME_VERSION}" defer></script>`,
  `<script src="/__srr/overlay.js?v=${THEME_VERSION}" defer></script>`,
].join('');

export async function proxyToPortal(request, env, url) {
  const production = url.hostname === env.PRODUCTION_HOST;
  const upstream = production ? request : toPortalOrigin(request, env, url);
  const res = await fetch(upstream);
  const out = production ? res : fromPortalOrigin(res, env, url);
  const type = out.headers.get('content-type') || '';
  if (request.method === 'GET' && out.status === 200 && type.includes('text/html')) return addTheme(out);
  return out;
}

// Preview only: send the request to the portal's own address, as if it came from there.
function toPortalOrigin(request, env, url) {
  const target = new URL(url.pathname + url.search, env.PORTAL_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');
  if (headers.has('origin')) headers.set('origin', target.origin);
  const referer = headers.get('referer');
  if (referer) {
    try {
      const r = new URL(referer);
      headers.set('referer', new URL(r.pathname + r.search, target.origin).toString());
    } catch {
      headers.delete('referer');
    }
  }
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  return new Request(target, { method: request.method, headers, body: hasBody ? request.body : undefined, redirect: 'manual' });
}

// Preview only: keep redirects and sign-in cookies on the preview address.
function fromPortalOrigin(res, env, url) {
  const out = new Response(res.body, res);
  const location = out.headers.get('location');
  if (location) {
    try {
      const l = new URL(location, env.PORTAL_ORIGIN);
      if (l.origin === new URL(env.PORTAL_ORIGIN).origin) out.headers.set('location', new URL(l.pathname + l.search + l.hash, url.origin).toString());
    } catch {}
  }
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (cookies.length) {
    out.headers.delete('set-cookie');
    for (const c of cookies) out.headers.append('set-cookie', c.replace(/;\s*domain=[^;]*/i, ''));
  }
  return out;
}

// Portal pages: swap in the clinic's collection categories (worker/categories.js), then add the theme.
async function addTheme(res) {
  const { html } = patchCategories(await res.text());
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  const patched = new Response(html, { status: res.status, statusText: res.statusText, headers });
  const themed = new HTMLRewriter()
    .on('meta[name="theme-color"]', { element(el) { el.setAttribute('content', '#173451'); } })
    .on('head', { element(el) { el.append(HEAD_TAGS, { html: true }); } })
    .transform(patched);
  const out = new Response(themed.body, themed);
  out.headers.delete('content-length');
  out.headers.set('cache-control', 'no-store');
  return out;
}
