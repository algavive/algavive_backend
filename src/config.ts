
const validTypes = ['Пост', 'Scratch', 'Видео', 'Web']

export default validTypes

const ALLOWED_URLS = [
  'www.image2url.com',
  'files.catbox.moe',
  'i.ibb.co',
  'host.posty5.com',
  'vercel.app',
  'lh3.googleusercontent.com',
  'docs.google.com',
  'pst5.com',
  'github.com',
  'raw.githubusercontent.com'
] as const;

function isAllowedHostname(hostname: string): boolean {
  return ALLOWED_URLS.some(allowed => {

    if (allowed === hostname) return true;

    if (allowed.startsWith('.')) {
      return hostname.endsWith(allowed);
    }
    return false;
  });
}

export function CHECK_ALLOWED_URLS(c: any, url: string): true | Response {
  try {
    if (!url || url.trim() === '') {
      return true;
    }

    const trimmed = url.trim();

    if (trimmed.startsWith('/')) {
      return true;
    }

    let fullUrl = trimmed;
    if (!/^https?:\/\//i.test(trimmed)) {
      fullUrl = 'https://' + trimmed;
    }

    const parsed = new URL(fullUrl);
    const hostname = parsed.hostname.toLowerCase();

    const pathname = parsed.pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    const DISALLOWED_EXTENSIONS = ['svg', 'webp'];
    if (ext && DISALLOWED_EXTENSIONS.includes(ext)) {
      return c.json({ error: 'SVG and WEBP files are not allowed' }, 403);
    }

    if (!isAllowedHostname(hostname)) {
      return c.json({ error: 'URL domain not allowed' }, 403);
    }

    return true;
  } catch {
    return c.json({ error: 'Invalid URL format' }, 400);
  }
}

/*
const check = CHECK_ALLOWED_URLS(c, iconValue);
if (check !== true) return check;
*/