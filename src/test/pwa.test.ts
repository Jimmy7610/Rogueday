import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * PWA verification.
 *
 * Browsers only register a service worker over http(s) in a top-level context,
 * which a test runner cannot provide. Instead of assuming the worker behaves,
 * these tests load the real `public/sw.js` into a mock ServiceWorkerGlobalScope
 * and drive its install / activate / fetch handlers directly, so the caching
 * logic that makes RogueDay work offline is genuinely exercised.
 */

const ROOT = resolve(__dirname, '../..');
const SW_SOURCE = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf8');
const MANIFEST = JSON.parse(
  readFileSync(resolve(ROOT, 'public/manifest.webmanifest'), 'utf8'),
) as Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Mock service worker environment                                     */
/* ------------------------------------------------------------------ */

interface MockCache {
  store: Map<string, Response>;
  add: (request: Request | string) => Promise<void>;
  put: (request: Request | string, response: Response) => Promise<void>;
  match: (request: Request | string) => Promise<Response | undefined>;
  keys: () => Promise<Request[]>;
}

const ORIGIN = 'http://localhost/';

/**
 * In a real worker, relative URLs resolve against the worker's scope. Node's
 * Request requires absolute URLs, so the harness resolves them the same way
 * the browser would.
 */
class ScopedRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const resolved =
      typeof input === 'string' ? new URL(input, ORIGIN).toString() : input;
    super(resolved as RequestInfo, init);
  }
}

function absolute(url: string): string {
  return new URL(url, ORIGIN).toString();
}

function keyOf(request: Request | string): string {
  return typeof request === 'string' ? absolute(request) : request.url;
}

function createEnvironment(options: { networkFails?: boolean } = {}) {
  const caches = new Map<string, MockCache>();
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const skipWaiting = vi.fn();
  const claim = vi.fn();

  const makeCache = (): MockCache => {
    const store = new Map<string, Response>();
    const cache: MockCache = {
      store,
      add: async (request) => {
        const response = await fetchImpl(new ScopedRequest(keyOf(request)));
        if (!response.ok) throw new Error('add failed');
        store.set(keyOf(request), response);
      },
      put: async (request, response) => {
        store.set(keyOf(request), response);
      },
      match: async (request) => store.get(keyOf(request)),
      keys: async () => [...store.keys()].map((url) => new ScopedRequest(url)),
    };
    return cache;
  };

  const cacheStorage = {
    open: async (name: string) => {
      if (!caches.has(name)) caches.set(name, makeCache());
      return caches.get(name)!;
    },
    keys: async () => [...caches.keys()],
    delete: async (name: string) => caches.delete(name),
    match: async (request: Request | string) => {
      for (const cache of caches.values()) {
        const hit = await cache.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const fetchImpl = vi.fn(async (request: Request | string) => {
    if (options.networkFails) throw new TypeError('offline');
    const url = keyOf(request);
    const body = url.includes('index.html') || url.endsWith('/') ? '<html>app</html>' : 'asset';
    const response = new Response(body, { status: 200 });
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  });

  const self = {
    location: new URL('http://localhost/'),
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(handler);
    },
    skipWaiting,
    clients: { claim },
    caches: cacheStorage,
  };

  // Evaluate the real worker source against the mock scope.
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

  return { dispatch, caches, cacheStorage, fetchImpl, skipWaiting, claim, listeners };
}

/* ------------------------------------------------------------------ */

describe('service worker source', () => {
  it('registers install, activate and fetch handlers', () => {
    const env = createEnvironment();
    expect(env.listeners.has('install')).toBe(true);
    expect(env.listeners.has('activate')).toBe(true);
    expect(env.listeners.has('fetch')).toBe(true);
  });

  it('precaches the app shell on install', async () => {
    const env = createEnvironment();
    await env.dispatch('install', {});

    const cacheName = [...env.caches.keys()][0];
    expect(cacheName).toMatch(/^rogueday-/);

    const cached = [...env.caches.get(cacheName)!.store.keys()];
    expect(cached).toContain('http://localhost/index.html');
    expect(cached).toContain('http://localhost/manifest.webmanifest');
    expect(cached.some((url) => url.includes('icon-192'))).toBe(true);
    expect(env.skipWaiting).toHaveBeenCalled();
  });

  it('a single failed precache entry does not abort the install', async () => {
    const env = createEnvironment();
    let calls = 0;
    env.fetchImpl.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) throw new Error('404');
      const response = new Response('ok', { status: 200 });
      Object.defineProperty(response, 'type', { value: 'basic' });
      return response;
    });

    await expect(env.dispatch('install', {})).resolves.not.toThrow();
    const cacheName = [...env.caches.keys()][0];
    expect(env.caches.get(cacheName)!.store.size).toBeGreaterThan(0);
  });

  it('deletes stale caches and claims clients on activate', async () => {
    const env = createEnvironment();
    await env.cacheStorage.open('rogueday-OLD');
    await env.cacheStorage.open('unrelated-cache');
    await env.dispatch('install', {});

    await env.dispatch('activate', {});

    const remaining = await env.cacheStorage.keys();
    expect(remaining).not.toContain('rogueday-OLD');
    expect(remaining).not.toContain('unrelated-cache');
    expect(remaining).toHaveLength(1);
    expect(env.claim).toHaveBeenCalled();
  });

  it('serves the cached shell when a navigation happens offline', async () => {
    const env = createEnvironment();
    await env.dispatch('install', {});

    // Go offline, then navigate.
    env.fetchImpl.mockImplementation(async () => {
      throw new TypeError('offline');
    });

    const response = (await env.dispatch('fetch', {
      // `mode` is read-only on Request, so define it the way the browser reports
      // it for a top-level navigation.
      request: Object.defineProperty(new ScopedRequest('http://localhost/'), 'mode', {
        value: 'navigate',
      }),
    })) as Response;

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('app');
  });

  it('serves cached assets offline', async () => {
    const env = createEnvironment();
    await env.dispatch('install', {});

    const assetUrl = 'http://localhost/assets/app.js';
    const cacheName = [...env.caches.keys()][0];
    await env.caches.get(cacheName)!.put(assetUrl, new Response('cached-asset'));

    env.fetchImpl.mockImplementation(async () => {
      throw new TypeError('offline');
    });

    const response = (await env.dispatch('fetch', {
      request: new ScopedRequest(assetUrl),
    })) as Response;

    await expect(response.text()).resolves.toBe('cached-asset');
  });

  it('ignores non-GET requests and cross-origin requests', async () => {
    const env = createEnvironment();
    await env.dispatch('install', {});

    const post = await env.dispatch('fetch', {
      request: new ScopedRequest('http://localhost/x', { method: 'POST' }),
    });
    expect(post).toBeUndefined();

    const crossOrigin = await env.dispatch('fetch', {
      request: new ScopedRequest('https://example.com/tracker.js'),
    });
    expect(crossOrigin).toBeUndefined();
  });

  it('never contacts anything but the app origin', () => {
    // The only URLs in the worker are same-origin relative paths.
    const urls = SW_SOURCE.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
    expect(urls).toEqual([]);
  });
});

describe('web app manifest', () => {
  it('has the fields an installable PWA needs', () => {
    expect(MANIFEST.name).toBeTruthy();
    expect(MANIFEST.short_name).toBe('RogueDay');
    expect(MANIFEST.start_url).toBe('./');
    expect(MANIFEST.scope).toBe('./');
    expect(MANIFEST.display).toBe('standalone');
    expect(MANIFEST.background_color).toBe('#05070d');
    expect(MANIFEST.theme_color).toBe('#05070d');
    expect(MANIFEST.lang).toBe('sv-SE');
  });

  it('declares 192 and 512 icons plus a maskable one', () => {
    const icons = MANIFEST.icons as { src: string; sizes: string; purpose?: string }[];
    expect(icons.some((icon) => icon.sizes === '192x192')).toBe(true);
    expect(icons.some((icon) => icon.sizes === '512x512')).toBe(true);
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('every icon file it references actually exists', () => {
    const icons = MANIFEST.icons as { src: string }[];
    for (const icon of icons) {
      const path = resolve(ROOT, 'public', icon.src.replace(/^\.\//, ''));
      expect(existsSync(path), icon.src).toBe(true);
    }
  });

  it('references no external hosts', () => {
    const serialised = JSON.stringify(MANIFEST);
    expect(serialised).not.toMatch(/https?:\/\//);
  });
});

describe('zero-cost architecture', () => {
  it('the app source contains no network calls or third-party endpoints', () => {
    const files = [
      'src/app/gameStore.ts',
      'src/app/GameProvider.tsx',
      'src/persistence/storage.ts',
      'src/game/completion.ts',
      'src/game/questSelection.ts',
      'src/game/boss.ts',
    ];

    for (const file of files) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      expect(source, `${file} must not fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} must not use XHR`).not.toMatch(/XMLHttpRequest/);
      expect(source, `${file} must not open a socket`).not.toMatch(/WebSocket/);
      expect(source, `${file} must not call a remote host`).not.toMatch(/https?:\/\/(?!localhost)/);
    }
  });

  it('only the storage module touches localStorage', () => {
    const storage = readFileSync(resolve(ROOT, 'src/persistence/storage.ts'), 'utf8');
    expect(storage).toMatch(/localStorage/);

    const otherSources = [
      'src/app/gameStore.ts',
      'src/app/GameProvider.tsx',
      'src/app/App.tsx',
      'src/game/completion.ts',
      'src/game/achievements.ts',
      'src/game/boss.ts',
      'src/game/loot.ts',
      'src/game/events.ts',
      'src/game/streak.ts',
      'src/game/progression.ts',
      'src/game/questSelection.ts',
      'src/screens/QuestScreen.tsx',
      'src/screens/BossScreen.tsx',
      'src/screens/HistoryScreen.tsx',
      'src/screens/BadgeScreen.tsx',
      'src/screens/DataScreen.tsx',
      'src/screens/Onboarding.tsx',
      'src/components/Hud.tsx',
    ];

    for (const file of otherSources) {
      const source = readFileSync(resolve(ROOT, file), 'utf8');
      expect(source, `${file} must not touch localStorage directly`).not.toMatch(
        /localStorage\.(get|set|remove)Item/,
      );
    }
  });

  it('declares no runtime dependencies beyond React', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['react', 'react-dom']);
  });
});
