import { ResponseMock, RequestEvent, RequestInfo } from 'testcafe-hammerhead';

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

    async abort(_errorCode?: string): Promise<void> {
        if (this._handled) return;
        this._handled = true;
        const mock = new ResponseMock('', 503, {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': '*',
            'access-control-allow-headers': '*',
        });
        await this.event.setMock(mock);
    }

    async continue(_options?: ContinueOptions): Promise<void> {
        if (this._handled) return;
        this._handled = true;
        // Not calling setMock lets the request proceed unchanged through the proxy
    }
}
