import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * GitHub Pages path safety.
 *
 * RogueDay is published as a project site at https://<user>.github.io/Rogueday/,
 * so nothing may be requested from the domain root. A single leading slash in
 * an asset, manifest or service-worker path would send the request to
 * github.io/... instead of github.io/Rogueday/... and break the deploy.
 *
 * These tests assert the sources of truth rather than a built dist/, so they
 * run in CI before the build and catch the regression at its origin.
 */

const ROOT = resolve(__dirname, '../..');
const read = (file: string): string => readFileSync(resolve(ROOT, file), 'utf8');

/** The base a project site is served from. */
const PAGES_BASE = 'https://jimmy7610.github.io/Rogueday/';

describe('vite base', () => {
  it('is relative, so the build works from any sub-directory', () => {
    const config = read('vite.config.ts');
    const match = config.match(/base:\s*'([^']+)'/);

    expect(match, 'vite.config.ts must declare an explicit base').not.toBeNull();
    const base = match![1];

    // './' keeps every emitted URL relative to the document. An absolute '/'
    // would pin the app to the domain root and break a project site.
    expect(base).toBe('./');
  });
});

describe('index.html', () => {
  const html = read('index.html');

  it('references its own assets relatively', () => {
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    const local = refs.filter(
      (ref) => !ref.startsWith('http') && !ref.startsWith('data:') && !ref.startsWith('#'),
    );

    expect(local.length).toBeGreaterThan(0);

    for (const ref of local) {
      // /src/main.tsx is the dev entry; Vite rewrites it to a hashed, relative
      // asset at build time, so it is the one permitted root-absolute path.
      if (ref === '/src/main.tsx') continue;
      expect(ref.startsWith('/'), `${ref} is root-absolute and would escape the base`).toBe(false);
    }
  });

  it('declares the manifest and icons relatively', () => {
    expect(html).toContain('href="./manifest.webmanifest"');
    expect(html).toContain('href="./icons/icon.svg"');
    expect(html).toContain('href="./icons/icon-192.png"');
  });

  it('hardcodes no localhost or deploy-specific host', () => {
    expect(html).not.toMatch(/localhost|127\.0\.0\.1|github\.io/);
  });
});

describe('web app manifest under a project subpath', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
    start_url: string;
    scope: string;
    icons: { src: string }[];
  };

  const manifestUrl = new URL('manifest.webmanifest', PAGES_BASE).href;
  const resolveFromManifest = (path: string): string => new URL(path, manifestUrl).href;

  it('start_url and scope resolve inside the project path', () => {
    expect(resolveFromManifest(manifest.start_url)).toBe(PAGES_BASE);
    expect(resolveFromManifest(manifest.scope)).toBe(PAGES_BASE);
  });

  it('every icon resolves inside the project path', () => {
    for (const icon of manifest.icons) {
      expect(resolveFromManifest(icon.src).startsWith(PAGES_BASE), icon.src).toBe(true);
    }
  });

  it('uses no root-absolute paths', () => {
    const raw = read('public/manifest.webmanifest');
    expect(raw).not.toMatch(/"\/[^"]*"/);
  });
});

describe('service worker under a project subpath', () => {
  const source = read('public/sw.js');

  it('registers from the Vite base, not a hardcoded root', () => {
    const main = read('src/main.tsx');
    expect(main).toContain('import.meta.env.BASE_URL');
    expect(main).not.toMatch(/register\(\s*['"`]\/sw\.js/);
  });

  it('precaches only relative paths', () => {
    const precache = source.match(/const PRECACHE = \[([\s\S]*?)\];/);
    expect(precache, 'sw.js must declare a PRECACHE list').not.toBeNull();

    const entries = [...precache![1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      expect(entry.startsWith('/'), `${entry} would be cached from the domain root`).toBe(false);
      expect(entry.startsWith('./')).toBe(true);
    }
  });

  it('caches every shell URL inside the project path when hosted there', async () => {
    // Drive the real worker with a scope of /Rogueday/ and check where its
    // precache actually lands.
    const env = createWorkerEnvironment(PAGES_BASE);
    await env.dispatch('install', {});

    const cacheName = [...env.caches.keys()][0];
    const cached = [...env.caches.get(cacheName)!.keys()];

    expect(cached.length).toBeGreaterThan(0);
    for (const url of cached) {
      expect(url.startsWith(PAGES_BASE), `${url} escaped the project path`).toBe(true);
    }

    // The app shell itself is cached at the project root, not the domain root.
    expect(cached).toContain(`${PAGES_BASE}index.html`);
    expect(cached).toContain(`${PAGES_BASE}manifest.webmanifest`);
  });

  it('serves the cached shell for a navigation inside the project path', async () => {
    const env = createWorkerEnvironment(PAGES_BASE);
    await env.dispatch('install', {});

    env.fetchImpl.mockImplementation(async () => {
      throw new TypeError('offline');
    });

    const request = Object.defineProperty(new env.ScopedRequest(PAGES_BASE), 'mode', {
      value: 'navigate',
    });
    const response = (await env.dispatch('fetch', { request })) as Response;

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
  });

  it('ignores requests from outside the project origin', async () => {
    const env = createWorkerEnvironment(PAGES_BASE);
    await env.dispatch('install', {});

    const foreign = await env.dispatch('fetch', {
      request: new env.ScopedRequest('https://example.com/tracker.js'),
    });

    expect(foreign).toBeUndefined();
  });

  it('contacts no absolute URL of its own', () => {
    expect(source.match(/https?:\/\/[^\s'"`)]+/g) ?? []).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Minimal ServiceWorkerGlobalScope, scoped to an arbitrary base        */
/* ------------------------------------------------------------------ */

function createWorkerEnvironment(base: string) {
  const SW_SOURCE = read('public/sw.js');
  const scopeUrl = new URL(base);

  class ScopedRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const resolved = typeof input === 'string' ? new URL(input, base).toString() : input;
      super(resolved as RequestInfo, init);
    }
  }

  const keyOf = (request: Request | string): string =>
    typeof request === 'string' ? new URL(request, base).toString() : request.url;

  const caches = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, ((event: unknown) => void)[]>();

  const fetchImpl = vi.fn(async (request: Request | string) => {
    const response = new Response('<html>app</html>', { status: 200 });
    Object.defineProperty(response, 'type', { value: 'basic' });
    void request;
    return response;
  });

  const makeCache = (store: Map<string, Response>) => ({
    add: async (request: Request | string) => {
      const response = await fetchImpl(new ScopedRequest(keyOf(request)));
      if (!response.ok) throw new Error('add failed');
      store.set(keyOf(request), response);
    },
    put: async (request: Request | string, response: Response) => {
      store.set(keyOf(request), response);
    },
    match: async (request: Request | string) => store.get(keyOf(request)),
    keys: async () => [...store.keys()].map((url) => new ScopedRequest(url)),
  });

  const cacheStorage = {
    open: async (name: string) => {
      if (!caches.has(name)) caches.set(name, new Map());
      return makeCache(caches.get(name)!);
    },
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
    match: async (request: Request | string) => {
      for (const store of caches.values()) {
        const hit = store.get(keyOf(request));
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const self = {
    // A worker served from /Rogueday/sw.js has this as its location.
    location: new URL('sw.js', base),
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(handler);
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
    caches: cacheStorage,
  };

  const factory = new Function(
    'self',
    'caches',
    'fetch',
    'Response',
    'Request',
    'URL',
    'location',
    SW_SOURCE,
  );
  factory(self, cacheStorage, fetchImpl, Response, ScopedRequest, URL, self.location);

  const dispatch = async (type: string, event: Record<string, unknown>): Promise<unknown> => {
    const pending: Promise<unknown>[] = [];
    let responded: Promise<Response> | null = null;

    const fullEvent = {
      ...event,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      respondWith: (promise: Promise<Response>) => {
        responded = promise;
      },
    };

    for (const handler of listeners.get(type) ?? []) handler(fullEvent);
    await Promise.all(pending);
    return responded ? await responded : undefined;
  };

  return { dispatch, caches, cacheStorage, fetchImpl, ScopedRequest, scopeUrl };
}
