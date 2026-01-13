// Base handler class for data extraction

export class BaseHandler {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
    this.displayName = 'Base Handler';
    this.enabled = true;
  }

  // Override in subclasses - returns true if this handler should process the request
  matches(details) {
    return false;
  }

  // Override in subclasses - extracts data from the request
  extract(details) {
    return null;
  }

  // Process a request - returns extracted data or null
  process(details) {
    if (!this.enabled || !this.matches(details)) {
      return null;
    }

    const extracted = this.extract(details);
    if (extracted) {
      return {
        handler: this.name,
        displayName: this.displayName,
        ...extracted
      };
    }
    return null;
  }

  // Helper to get header value (case-insensitive)
  getHeader(headers, name) {
    if (!headers) return null;

    const header = headers.find(
      h => h.name.toLowerCase() === name.toLowerCase()
    );
    return header ? header.value : null;
  }

  // Helper to parse URL
  parseUrl(url) {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  // Helper to extract from cookie header
  getCookie(headers, cookieName) {
    const cookieHeader = this.getHeader(headers, 'cookie');
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.split('=');
      if (name.trim() === cookieName) {
        return valueParts.join('=');
      }
    }
    return null;
  }
}
