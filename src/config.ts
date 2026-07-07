
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
  'github.com'
] as const;

export function CHECK_ALLOWED_URLS(c: any, url: string): true | Response {
  try {
  if (!url || url.trim() === '') {
    return true;
  }
  
  if (url.trim().startsWith('static/')) {
    return true;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
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