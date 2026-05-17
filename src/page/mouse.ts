import { BridgeSession } from '../session/bridge-session';

export type MouseButton = 'left' | 'right' | 'middle';

export class Mouse {
    constructor(private readonly session: BridgeSession) {}

    async click(
        x: number,
        y: number,
        _options?: { button?: MouseButton; clickCount?: number; delay?: number }
    ): Promise<void> {
        await this.session.sendCommand({ type: 'mouseClick', x, y });
    }

    async dblclick(x: number, y: number, _options?: { delay?: number }): Promise<void> {
        await this.session.sendCommand({ type: 'mouseClick', x, y });
        await this.session.sendCommand({ type: 'mouseClick', x, y });
    }

    async move(_x: number, _y: number, _options?: { steps?: number }): Promise<void> {
        // Mouse move via script injection has limited effect; kept for API compatibility
    }

    async down(_options?: { button?: MouseButton }): Promise<void> {}

    async up(_options?: { button?: MouseButton }): Promise<void> {}

    async wheel(x: number, y: number, options?: { deltaX?: number; deltaY?: number }): Promise<void> {
        await this.session.sendCommand({
            type: 'mouseWheel',
            x, y,
            deltaX: options?.deltaX ?? 0,
            deltaY: options?.deltaY ?? 0,
        });
    }
}
