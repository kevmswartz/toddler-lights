// Shared Tauri bridge and runtime detection
// This file provides common utilities used by both app.js and lights.js

const tauriBridge = typeof window !== 'undefined' ? window.__TAURI__ : undefined;

const tauriInvoke = (() => {
    if (!tauriBridge) return undefined;
    if (typeof tauriBridge.invoke === 'function') {
        return tauriBridge.invoke.bind(tauriBridge);
    }
    if (typeof tauriBridge.core?.invoke === 'function') {
        return tauriBridge.core.invoke.bind(tauriBridge.core);
    }
    if (typeof tauriBridge.tauri?.invoke === 'function') {
        return tauriBridge.tauri.invoke.bind(tauriBridge.tauri);
    }
    return undefined;
})();

window.isNativeRuntime = Boolean(tauriInvoke);
