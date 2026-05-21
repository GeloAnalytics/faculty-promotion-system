export function parseCookieHeader(header: string): Record<string, string> {
  return header.split(';').reduce<Record<string, string>>((cookies, entry) => {
    const [rawKey, ...rawValue] = entry.trim().split('=');
    if (!rawKey) {
      return cookies;
    }

    cookies[rawKey] = rawValue.join('=');
    return cookies;
  }, {});
}
