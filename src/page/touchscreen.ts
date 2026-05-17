import { BridgeSession } from '../session/bridge-session';

export class Touchscreen {
    constructor(private readonly session: BridgeSession) {}

    async tap(x: number, y: number): Promise<void> {
        await this.session.sendCommand({ type: 'touchTap', x, y });
    }
}
