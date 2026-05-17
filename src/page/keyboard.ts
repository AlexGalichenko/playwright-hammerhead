import { BridgeSession } from '../session/bridge-session';

export class Keyboard {
    constructor(private readonly session: BridgeSession) {}

    async press(key: string, _options?: { delay?: number }): Promise<void> {
        await this.session.sendCommand({ type: 'keyPress', key });
    }

    async down(key: string): Promise<void> {
        await this.session.sendCommand({ type: 'keyPress', key });
    }

    async up(_key: string): Promise<void> {
        // Key up is implicit after keyPress; no separate bridge command needed
    }

    async type(text: string, options?: { delay?: number }): Promise<void> {
        const delay = options?.delay ?? 0;
        for (const char of text) {
            await this.session.sendCommand({ type: 'keyPress', key: char });
            if (delay > 0) await new Promise(r => setTimeout(r, delay));
        }
    }

    async insertText(text: string): Promise<void> {
        await this.session.sendCommand({
            type: 'evaluate',
            expression: `document.execCommand('insertText', false, ${JSON.stringify(text)})`,
        });
    }
}
