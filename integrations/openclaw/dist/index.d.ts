type OpenClawApi = {
    on?: (hook: string, handler: (...args: never[]) => unknown, options?: Record<string, unknown>) => void;
    registerHook?: (hook: string, handler: (...args: never[]) => unknown, options?: Record<string, unknown>) => void;
    registerCommand?: (command: Record<string, unknown>) => void;
    getConfig?: () => unknown;
    config?: unknown;
};
declare const entry: {
    id: string;
    name: string;
    description: string;
    register(api: OpenClawApi): void;
};
export default entry;
