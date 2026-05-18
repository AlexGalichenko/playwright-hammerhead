import { BridgeSession } from '../session/bridge-session';

export type MouseButton = 'left' | 'right' | 'middle';

export class Mouse {
    private _x = 0;
    private _y = 0;

    constructor(private readonly session: BridgeSession) {}

    async click(
        x: number,
        y: number,
        _options?: { button?: MouseButton; clickCount?: number; delay?: number }
    ): Promise<void> {
        this._x = x; this._y = y;
        await this.session.sendCommand({ type: 'mouseClick', x, y });
    }

    async dblclick(x: number, y: number, _options?: { delay?: number }): Promise<void> {
        this._x = x; this._y = y;
        await this.session.sendCommand({ type: 'mouseClick', x, y });
        await this.session.sendCommand({ type: 'mouseClick', x, y });
    }

    async move(x: number, y: number, _options?: { steps?: number }): Promise<void> {
        this._x = x; this._y = y;
        await this.session.sendCommand({ type: 'mouseMove', x, y });
    }

    async down(options?: { button?: MouseButton }): Promise<void> {
        await this.session.sendCommand({ type: 'mouseDown', x: this._x, y: this._y, button: options?.button ?? 'left' });
    }

    async up(options?: { button?: MouseButton }): Promise<void> {
        await this.session.sendCommand({ type: 'mouseUp', x: this._x, y: this._y, button: options?.button ?? 'left' });
    }

    async wheel(x: number, y: number, options?: { deltaX?: number; deltaY?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'mouseWheel',
            x, y,
            deltaX: options?.deltaX ?? 0,
            deltaY: options?.deltaY ?? 0,
        });
    }
}
