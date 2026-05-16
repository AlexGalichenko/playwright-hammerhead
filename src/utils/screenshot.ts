import { readFileSync } from 'fs';

let _cache: string | null = null;

export function getModernScreenshotCode(): string {
    if (!_cache) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _cache = readFileSync(require.resolve('modern-screenshot/dist/index.js'), 'utf-8');
    }
    return _cache;
}
