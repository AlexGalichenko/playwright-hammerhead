import { ResponseMock, RequestEvent, RequestInfo } from 'testcafe-hammerhead';

const ABORT_STATUS: Record<string, number> = {
    accessdenied: 403,
    namenotresolved: 502,
    timedout: 504,
    connectionrefused: 503,
    connectionfailed: 503,
    connectionreset: 503,
    connectionaborted: 503,
    internetdisconnected: 503,
    blockedbyclient: 499,
    failed: 503,
    aborted: 503,
};

export interface FulfillOptions {
    status?: number;
    body?: string | Buffer;
    headers?: Record<string, string>;
    contentType?: string;
}

export interface ContinueOptions {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    postData?: string | Buffer;
}

export class Request {
    constructor(private readonly info: RequestInfo) {}

    url(): string {
        return this.info.url;
    }

    method(): string {
        return this.info.method;
    }

    headers(): Record<string, string> {
        return this.info.headers as Record<string, string>;
    }

    postData(): string | null {
        const { body } = this.info;
        if (!body || body.length === 0) return null;
        return body.toString('utf-8');
    }
}

export class Route {
    private _handled = false;

    constructor(
        private readonly event: RequestEvent,
        private readonly _request: Request
    ) {}

    request(): Request {
        return this._request;
    }

    async fulfill(options: FulfillOptions = {}): Promise<void> {
        if (this._handled) return;
        this._handled = true;

        const { status = 200, body = '', headers = {}, contentType } = options;

        // Hammerhead's same-origin check inspects the mock response's own ACAO header.
        // Without it the pipeline sets isSameOriginPolicyFailed=true and the client-side
        // fetch override raises a CORS error even though the proxy request is same-origin.
        const allHeaders: Record<string, string> = {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': '*',
            'access-control-allow-headers': '*',
            ...headers,
        };
        if (contentType) allHeaders['content-type'] = contentType;

        const bodyStr = (body instanceof Buffer ? body.toString('utf-8') : body) as string;
        const mock = new ResponseMock(bodyStr, status, allHeaders);
        await this.event.setMock(mock);
    }

    async abort(errorCode?: string): Promise<void> {
        if (this._handled) return;
        this._handled = true;
        // Hammerhead proxies at HTTP level; a real TCP abort is not achievable.
        // Map the error code to the closest HTTP status so callers can distinguish errors.
        const status = (errorCode ? (ABORT_STATUS[errorCode] ?? 503) : 503);
        const mock = new ResponseMock('', status, {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': '*',
            'access-control-allow-headers': '*',
        });
        await this.event.setMock(mock);
    }

    async continue(options?: ContinueOptions): Promise<void> {
        if (this._handled) return;
        this._handled = true;

        if (!options || Object.keys(options).length === 0) {
            // No modifications — let the request pass through the proxy unchanged
            return;
        }

        // Re-issue the request with the modified parameters and fulfill with the real response
        const url = options.url ?? this._request.url();
        const method = options.method ?? this._request.method();
        const headers = options.headers ?? (this._request.headers() as Record<string, string>);
        const body = options.postData != null
            ? (typeof options.postData === 'string' ? options.postData : options.postData)
            : undefined;

        const res = await fetch(url, { method, headers: headers as Record<string, string>, body });
        const buf = Buffer.from(await res.arrayBuffer());
        const responseHeaders: Record<string, string> = {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': '*',
            'access-control-allow-headers': '*',
        };
        res.headers.forEach((value, key) => { responseHeaders[key] = value; });

        const mock = new ResponseMock(buf.toString('binary'), res.status, responseHeaders);
        await this.event.setMock(mock);
    }
}
