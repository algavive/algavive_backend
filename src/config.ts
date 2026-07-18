
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
  
  'pagedrop.io',
  'boomurl.me',
  'iimg.live',
  'x02.me'
] as const;

export function CHECK_ALLOWED_URLS(c: any, url: string): true | Response {
  try {
  if (!url || url.trim() === '') {
    return true;
  }
  
  if (!url.trim().startsWith('http')) {
    return true;
  }
  /*
  if (url.trim().contains('.github.io')){
    return true
  }*/

  if (url.trim().startsWith('base64')){
    return c.json({ error: 'base64 not allowed' }, 403);
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    const pathname = parsed.pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    const DISALLOWED_EXTENSIONS = ['svg', 'webp'];
    if (ext && DISALLOWED_EXTENSIONS.includes(ext)) {
      return c.json({ error: 'SVG and WEBP files are not allowed' }, 403);
    }

    const isValid = ALLOWED_URLS.some(allowed => allowed.toLowerCase() === hostname);
    if (!isValid) {
      return c.json({ error: 'URL domain not allowed' }, 403);
    }
    return true;
  } catch {
    return c.json({ error: 'Invalid URL format' }, 400);
  }
} catch{
  return true
}
}

/*
const check = CHECK_ALLOWED_URLS(c, iconValue);
if (check !== true) return check;
*/