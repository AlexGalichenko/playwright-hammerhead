export interface APIRequestOptions {
    data?: string | Buffer | Record<string, unknown>;
    form?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    multipart?: Record<string, string | Buffer | { name: string; mimeType: string; buffer: Buffer }>;
    params?: Record<string, string | number | boolean>;
    timeout?: number;
    failOnStatusCode?: boolean;
    ignoreHTTPSErrors?: boolean;
}

export interface APIRequestContextOptions {
    baseURL?: string;
    extraHTTPHeaders?: Record<string, string>;
    timeout?: number;
}

export class APIResponse {
    private readonly _url: string;
    private readonly _status: number;
    private readonly _statusText: string;
    private readonly _headers: Record<string, string>;
    private readonly _body: Buffer;

    constructor(
        url: string,
        status: number,
        statusText: string,
        headers: Record<string, string>,
        body: Buffer,
    ) {
        this._url = url;
        this._status = status;
        this._statusText = statusText;
        this._headers = headers;
        this._body = body;
    }

    ok(): boolean { return this._status >= 200 && this._status < 300; }
    status(): number { return this._status; }
    statusText(): string { return this._statusText; }
    headers(): Record<string, string> { return { ...this._headers }; }
    url(): string { return this._url; }
    async body(): Promise<Buffer> { return this._body; }
    async text(): Promise<string> { return this._body.toString('utf-8'); }
    async json<T = unknown>(): Promise<T> { return JSON.parse(this._body.toString('utf-8')) as T; }
}

export class APIRequestContext {
    private readonly _defaultTimeout: number;
    private readonly _baseURL: string | undefined;
    private readonly _defaultHeaders: Record<string, string>;

    constructor(options?: APIRequestContextOptions) {
        this._defaultTimeout = options?.timeout ?? 30_000;
        this._baseURL = options?.baseURL;
        this._defaultHeaders = options?.extraHTTPHeaders ?? {};
    }

    private _resolveUrl(url: string): string {
        if (this._baseURL && !/^https?:\/\//.test(url)) {
            return new URL(url, this._baseURL).href;
        }
        return url;
    }

    private _buildUrl(url: string, params?: Record<string, string | number | boolean>): string {
        const resolved = this._resolveUrl(url);
        if (!params) return resolved;
        const u = new URL(resolved);
        for (const [key, value] of Object.entries(params)) {
            u.searchParams.append(key, String(value));
        }
        return u.href;
    }

    private async _request(method: string, url: string, options?: APIRequestOptions): Promise<APIResponse> {
        const resolvedUrl = this._buildUrl(url, options?.params);
        const timeout = options?.timeout ?? this._defaultTimeout;

        const headers: Record<string, string> = {
            ...this._defaultHeaders,
            ...(options?.headers ?? {}),
        };

        let body: string | Buffer | undefined;

        if (options?.data !== undefined) {
            if (typeof options.data === 'string' || Buffer.isBuffer(options.data)) {
                body = options.data;
            } else {
                headers['content-type'] ??= 'application/json';
                body = JSON.stringify(options.data);
            }
        } else if (options?.form !== undefined) {
            headers['content-type'] ??= 'application/x-www-form-urlencoded';
            body = new URLSearchParams(
                Object.fromEntries(Object.entries(options.form).map(([k, v]) => [k, String(v)]))
            ).toString();
        } else if (options?.multipart !== undefined) {
            const boundary = `----HHBoundary${Math.random().toString(36).slice(2)}`;
            headers['content-type'] = `multipart/form-data; boundary=${boundary}`;
            const parts: Buffer[] = [];
            for (const [key, value] of Object.entries(options.multipart)) {
                const header = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"`;
                if (typeof value === 'string') {
                    parts.push(Buffer.from(`${header}\r\n\r\n${value}\r\n`, 'utf-8'));
                } else if (Buffer.isBuffer(value)) {
                    parts.push(Buffer.from(`${header}\r\n\r\n`, 'utf-8'), value, Buffer.from('\r\n', 'utf-8'));
                } else {
                    parts.push(
                        Buffer.from(`${header}; filename="${value.name}"\r\nContent-Type: ${value.mimeType}\r\n\r\n`, 'utf-8'),
                        value.buffer,
                        Buffer.from('\r\n', 'utf-8'),
                    );
                }
            }
            parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
            body = Buffer.concat(parts);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const fetchInit: RequestInit = {
                method,
                headers: headers as Record<string, string>,
                signal: controller.signal,
            };

            if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
                fetchInit.body = body as string | Buffer;
            }

            const response = await globalThis.fetch(resolvedUrl, fetchInit);
            const responseBody = Buffer.from(await response.arrayBuffer());

            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => { responseHeaders[key] = value; });

            const apiResponse = new APIResponse(
                response.url || resolvedUrl,
                response.status,
                response.statusText,
                responseHeaders,
                responseBody,
            );

            if (options?.failOnStatusCode && !apiResponse.ok()) {
                throw new Error(`${method} ${resolvedUrl} failed: ${response.status} ${response.statusText}`);
            }

            return apiResponse;
        } finally {
            clearTimeout(timer);
        }
    }

    async fetch(url: string, options?: APIRequestOptions): Promise<APIResponse> {
        return this._request(options ? (options as { method?: string }).method ?? 'GET' : 'GET', url, options);
    }

    async get(url: string, options?: Omit<APIRequestOptions, 'data' | 'form' | 'multipart'>): Promise<APIResponse> {
        return this._request('GET', url, options);
    }

    async post(url: string, options?: APIRequestOptions): Promise<APIResponse> {
        return this._request('POST', url, options);
    }

    async put(url: string, options?: APIRequestOptions): Promise<APIResponse> {
        return this._request('PUT', url, options);
    }

    async patch(url: string, options?: APIRequestOptions): Promise<APIResponse> {
        return this._request('PATCH', url, options);
    }

    async delete(url: string, options?: APIRequestOptions): Promise<APIResponse> {
        return this._request('DELETE', url, options);
    }

    async head(url: string, options?: Omit<APIRequestOptions, 'data' | 'form' | 'multipart'>): Promise<APIResponse> {
        return this._request('HEAD', url, options);
    }

    async dispose(): Promise<void> {}
}
