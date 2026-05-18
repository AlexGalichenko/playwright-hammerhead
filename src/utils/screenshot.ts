import { readFileSync } from 'node:fs';

let _cache: string | null = null;

export function getModernScreenshotCode(): string {
    if (!_cache) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _cache = readFileSync(require.resolve('modern-screenshot/dist/index.js'), 'utf-8');
    }
    return _cache;
}

export function buildScreenshotExpression(
    targetExpr: string,
    options?: { type?: 'png' | 'jpeg'; quality?: number; fullPage?: boolean }
): string {
    const libCode = getModernScreenshotCode();
    const isJpeg = options?.type === 'jpeg';
    const quality = options?.quality ?? (isJpeg ? 0.92 : 1);
    const msType = isJpeg ? 'image/jpeg' : 'image/png';
    const fullPage = options?.fullPage ?? false;
    const fullPageScript = fullPage
        ? 'opts.width = document.documentElement.scrollWidth; opts.height = document.documentElement.scrollHeight;'
        : '';

    return `
        new Promise(function(resolve, reject) {
            try {
                if (!window.__modernScreenshotLoaded) {
                    var s = document.createElement('script');
                    s.textContent = ${JSON.stringify(libCode)};
                    document.head.appendChild(s);
                    window.__modernScreenshotLoaded = true;
                }
                var target = (${targetExpr});
                if (!target) { reject(new Error('Element not found')); return; }
                var opts = { type: ${JSON.stringify(msType)}, quality: ${quality} };
                ${fullPageScript}
                var fn = ${isJpeg} ? window.modernScreenshot.domToJpeg : window.modernScreenshot.domToPng;
                fn(target, opts).then(resolve).catch(reject);
            } catch(e) { reject(e instanceof Error ? e.message : String(e)); }
        })
    `;
}

export function decodeScreenshotDataUrl(dataUrl: unknown): Buffer {
    if (!dataUrl || typeof dataUrl !== 'string')
        throw new Error('Screenshot failed: received empty or invalid response from page');
    const base64 = dataUrl.split(',')[1];
    if (!base64)
        throw new Error('Screenshot failed: data URL has no base64 payload');
    return Buffer.from(base64, 'base64');
}
