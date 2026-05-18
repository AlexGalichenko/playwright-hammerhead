import { readFileSync } from 'fs';

export type FilePayload = { name: string; mimeType: string; buffer: Buffer };
export type FileInput = string | FilePayload | (string | FilePayload)[];

type SerializedFile = { name: string; mimeType: string; base64: string };

export function serializeFiles(files: FileInput): SerializedFile[] {
    const arr = Array.isArray(files) ? files : [files];
    return arr.map(f => {
        if (typeof f === 'string') {
            const buf = readFileSync(f);
            return { name: f.split('/').pop() ?? f, mimeType: 'application/octet-stream', base64: buf.toString('base64') };
        }
        return { name: f.name, mimeType: f.mimeType, base64: f.buffer.toString('base64') };
    });
}

export function fileTransferScript(serialized: SerializedFile[]): string {
    return `var dt = new DataTransfer();
        ${JSON.stringify(serialized)}.forEach(function(p) {
            var bytes = atob(p.base64);
            var arr = new Uint8Array(bytes.length);
            for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            dt.items.add(new File([arr], p.name, { type: p.mimeType }));
        });
        Object.defineProperty(el, 'files', { value: dt.files, configurable: true });
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));`;
}
