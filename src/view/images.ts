import { Facet } from '@codemirror/state';

export type ImageFetcher = (resolvedPath: string, src: string) => Promise<string | null>;

export interface ImageResolver {
  currentPath(): string;
  resolve: ImageFetcher;
  dispose?(): void;
}

export const imageResolver = Facet.define<ImageResolver, ImageResolver | null>({
  combine: values => values[0] ?? null
});

export function isExternal(src: string): boolean {
  return /^(https?:|data:|blob:)/i.test(src);
}

export function resolveImagePath(currentPath: string, src: string): string {
  if (src.startsWith('/')) return src;

  const directory = currentPath.slice(0, currentPath.lastIndexOf('/') + 1);
  const parts: string[] = [];

  for (const segment of `${directory}${src}`.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }

  return `/${parts.join('/')}`;
}

export function createImageResolver(currentPath: () => string, fetch: ImageFetcher): ImageResolver {
  const cache = new Map<string, Promise<string | null>>();

  return {
    currentPath,
    resolve(resolvedPath, src) {
      let pending = cache.get(resolvedPath);

      if (!pending) {
        pending = fetch(resolvedPath, src);
        cache.set(resolvedPath, pending);
      }

      return pending;
    },
    dispose() {
      for (const pending of cache.values()) {
        pending.then(url => {
          if (url) URL.revokeObjectURL(url);
        });
      }
      cache.clear();
    }
  };
}
