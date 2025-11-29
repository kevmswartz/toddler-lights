'use strict';

const STORAGE_KEYS = {
    ip: 'govee_ip',
    port: 'govee_port',
    apiKey: 'govee_api_key',
    brightness: 'govee_brightness'
};

const DEFAULT_PORT = 4003;
const DEFAULT_BRIGHTNESS = 50;

const state = {
    isNative: typeof tauriInvoke === 'function',
    discovery: [],
    cloudDevices: [],
    lastLanStatus: null,
    lastCloudState: null
};

const STATUS_VARIANTS = {
    info: 'text-indigo-100',
    success: 'text-emerald-200',
    error: 'text-rose-200'
};

function $(id) {
    return document.getElementById(id);
}

function setStatus(el, message, variant = 'info') {
    if (!el) return;
    const variantClass = STATUS_VARIANTS[variant] || STATUS_VARIANTS.info;
    el.className = `text-sm font-semibold ${variantClass}`;
    el.textContent = message;
}

function logActivity(message) {
    const list = $('activityLog');
    if (!list) return;
    const item = document.createElement('li');
    const timestamp = new Date().toLocaleTimeString();
    item.textContent = `[${timestamp}] ${message}`;
    item.className = 'rounded-xl bg-white/5 px-3 py-2';

    if (list.firstElementChild && list.firstElementChild.textContent.includes('No activity')) {
        list.innerHTML = '';
    }

    list.prepend(item);
}

function setRuntimeBanner() {
    const badge = $('runtimeBadge');
    const note = $('runtimeNote');
    if (!badge || !note) return;

    if (state.isNative) {
        badge.textContent = 'Runtime: Native (Tauri)';
        badge.className = 'inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 font-semibold text-emerald-50';
        note.textContent = 'UDP + HTTP calls are available.';
    } else {
        badge.textContent = 'Runtime: Browser only';
        badge.className = 'inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 font-semibold text-amber-50';
        note.textContent = 'LAN and cloud control require running inside the Tauri shell.';
    }
}

function loadStoredSettings() {
    const ip = localStorage.getItem(STORAGE_KEYS.ip) || '';
    const port = localStorage.getItem(STORAGE_KEYS.port) || '';
    const apiKey = localStorage.getItem(STORAGE_KEYS.apiKey) || '';
    const brightness = Number(localStorage.getItem(STORAGE_KEYS.brightness)) || DEFAULT_BRIGHTNESS;

    if ($('lanIp')) $('lanIp').value = ip;
    if ($('lanPort')) $('lanPort').value = port || DEFAULT_PORT;
    if ($('cloudApiKey')) $('cloudApiKey').value = apiKey;
    if ($('lanBrightness')) $('lanBrightness').value = brightness;
    if ($('lanBrightnessValue')) $('lanBrightnessValue').textContent = `${brightness}%`;
    if ($('cloudBrightness')) $('cloudBrightness').value = brightness;
    if ($('cloudBrightnessValue')) $('cloudBrightnessValue').textContent = `${brightness}%`;

    updateApiKeyStatus();
}

function saveLanSettings() {
    const ip = ($('lanIp')?.value || '').trim();
    const portInput = $('lanPort')?.value;
    const port = Number(portInput) || DEFAULT_PORT;

    if (!ip) {
        setStatus($('lanStatus'), 'Enter an IP address first.', 'error');
        return;
    }

    localStorage.setItem(STORAGE_KEYS.ip, ip);
    localStorage.setItem(STORAGE_KEYS.port, String(port));
    setStatus($('lanStatus'), `Saved ${ip}:${port}`, 'success');
    logActivity(`Saved LAN target ${ip}:${port}`);
}

function updateApiKeyStatus() {
    const apiKey = getStoredApiKey();
    const statusEl = $('cloudKeyStatus');
    const clearBtn = $('clearApiKey');
    if (statusEl) {
        statusEl.textContent = apiKey ? 'API key saved locally (only used in Tauri).' : 'No API key saved.';
    }
    if (clearBtn) {
        clearBtn.classList.toggle('hidden', !apiKey);
    }
}

function updateBrightnessLabels() {
    const lanValue = $('lanBrightness')?.value || DEFAULT_BRIGHTNESS;
    const cloudValue = $('cloudBrightness')?.value || DEFAULT_BRIGHTNESS;
    if ($('lanBrightnessValue')) $('lanBrightnessValue').textContent = `${lanValue}%`;
    if ($('cloudBrightnessValue')) $('cloudBrightnessValue').textContent = `${cloudValue}%`;
}

function ensureNative(feature) {
    if (!state.isNative) {
        const message = `${feature} requires running inside the Tauri app so we can send UDP/HTTP requests.`;
        setStatus($('lanStatus'), message, 'error');
        throw new Error(message);
    }
}

function resolveLanTarget() {
    const host = ($('lanIp')?.value || '').trim();
    const portValue = Number($('lanPort')?.value) || DEFAULT_PORT;
    if (!host) {
        throw new Error('Add the light IP first.');
    }
    return { host, port: portValue };
}

function renderLanStatus(status) {
    const onlineText = status?.online ? 'yes' : 'no';
    const powerText = status?.power === undefined || status?.power === null ? '—' : status.power ? 'on' : 'off';
    const brightnessText = status?.brightness ? `${status.brightness}%` : '—';

    if ($('lanOnline')) $('lanOnline').textContent = onlineText;
    if ($('lanPower')) $('lanPower').textContent = powerText;
    if ($('lanBrightnessLabel')) $('lanBrightnessLabel').textContent = brightnessText;

    const color = status?.color;
    const colorLabel = color ? `rgb(${color.r}, ${color.g}, ${color.b})` : '—';
    if ($('lanColorLabel')) $('lanColorLabel').textContent = colorLabel;
    if ($('lanColorSwatch')) $('lanColorSwatch').style.backgroundColor = color ? `rgb(${color.r}, ${color.g}, ${color.b})` : '#1f2937';
}

async function sendLanCommand(cmd) {
    const target = resolveLanTarget();
    ensureNative('LAN control');
    await tauriInvoke('govee_send', { host: target.host, port: target.port, body: { msg: cmd } });
    setStatus($('lanStatus'), `Sent ${cmd.cmd} to ${target.host}:${target.port}`, 'success');
    logActivity(`LAN: ${cmd.cmd} → ${target.host}:${target.port}`);
    return target;
}

async function handleLanPower(desired) {
    try {
        await sendLanCommand({ cmd: 'turn', data: { value: desired ? 1 : 0 } });
        state.lastLanStatus = { ...(state.lastLanStatus || {}), power: desired, online: true };
        renderLanStatus(state.lastLanStatus);
    } catch (error) {
        console.error(error);
        setStatus($('lanStatus'), error.message || 'Power command failed.', 'error');
    }
}

async function toggleLanPower() {
    const current = state.lastLanStatus?.power ?? false;
    return handleLanPower(!current);
}

async function applyLanBrightness() {
    const value = Number($('lanBrightness')?.value) || DEFAULT_BRIGHTNESS;
    try {
        await sendLanCommand({ cmd: 'brightness', data: { value } });
        localStorage.setItem(STORAGE_KEYS.brightness, String(value));
        state.lastLanStatus = { ...(state.lastLanStatus || {}), brightness: value, online: true };
        renderLanStatus(state.lastLanStatus);
    } catch (error) {
        console.error(error);
        setStatus($('lanStatus'), error.message || 'Brightness command failed.', 'error');
    }
}

function hexToRgb(hex) {
    const normalized = hex.replace('#', '');
    if (normalized.length !== 6) return null;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].some(v => Number.isNaN(v))) return null;
    return { r, g, b };
}

async function applyLanColor() {
    const rgb = hexToRgb($('lanColor')?.value || '#ffffff');
    if (!rgb) {
        setStatus($('lanStatus'), 'Pick a valid color.', 'error');
        return;
    }

    try {
        await sendLanCommand({ cmd: 'color', data: rgb });
        state.lastLanStatus = { ...(state.lastLanStatus || {}), color: rgb, online: true };
        renderLanStatus(state.lastLanStatus);
    } catch (error) {
        console.error(error);
        setStatus($('lanStatus'), error.message || 'Color command failed.', 'error');
    }
}

async function refreshLanStatus() {
    try {
        const target = resolveLanTarget();
        ensureNative('Status lookup');
        const status = await tauriInvoke('govee_status', { host: target.host, port: target.port });
        state.lastLanStatus = status;
        renderLanStatus(status);
        setStatus($('lanStatus'), `Status received from ${target.host}`, 'success');
        logActivity(`LAN status from ${target.host}: ${JSON.stringify(status)}`);
    } catch (error) {
        console.error(error);
        setStatus($('lanStatus'), error.message || 'Status check failed.', 'error');
    }
}

function renderDiscovery() {
    const container = $('discoveryResults');
    if (!container) return;

    if (!state.discovery.length) {
        container.innerHTML = '<p>No devices discovered yet.</p>';
        return;
    }

    container.innerHTML = '';
    state.discovery.forEach(device => {
        const ip = device.ip || device.source_ip || 'Unknown IP';
        const model = device.model || device.sku || 'Unknown model';
        const mac = device.mac_address || device.device_id || 'Unknown MAC';
        const item = document.createElement('div');
        item.className = 'rounded-2xl bg-slate-900/40 p-3 flex items-center justify-between gap-3';

        const info = document.createElement('div');
        info.className = 'text-sm text-white';
        info.innerHTML = `<div class="font-semibold">${ip}</div><div class="text-slate-300">${model} · ${mac}</div>`;

        const useButton = document.createElement('button');
        useButton.type = 'button';
        useButton.className = 'rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/25';
        useButton.textContent = 'Use target';
        useButton.addEventListener('click', () => {
            if ($('lanIp')) $('lanIp').value = ip;
            if ($('lanPort')) $('lanPort').value = device.source_port || DEFAULT_PORT;
            saveLanSettings();
        });

        item.appendChild(info);
        item.appendChild(useButton);
        container.appendChild(item);
    });
}

async function discoverLanDevices() {
    try {
        ensureNative('Discovery');
        setStatus($('lanStatus'), 'Listening for LAN responses…', 'info');
        const devices = await tauriInvoke('govee_discover', { timeout_ms: 3000 });
        state.discovery = Array.isArray(devices) ? devices : [];
        renderDiscovery();
        setStatus($('lanStatus'), `Found ${state.discovery.length} device(s).`, 'success');
        logActivity(`LAN discovery returned ${state.discovery.length} device(s).`);
    } catch (error) {
        console.error(error);
        setStatus($('lanStatus'), error.message || 'Discovery failed.', 'error');
    }
}

function getStoredApiKey() {
    return localStorage.getItem(STORAGE_KEYS.apiKey) || '';
}

function saveApiKey() {
    const key = ($('cloudApiKey')?.value || '').trim();
    if (!key) {
        setStatus($('cloudStatus'), 'Enter an API key first.', 'error');
        return;
    }
    localStorage.setItem(STORAGE_KEYS.apiKey, key);
    updateApiKeyStatus();
    setStatus($('cloudStatus'), 'Saved API key locally.', 'success');
    logActivity('Saved cloud API key.');
}

function clearApiKey() {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    if ($('cloudApiKey')) $('cloudApiKey').value = '';
    updateApiKeyStatus();
    setStatus($('cloudStatus'), 'Cleared API key.', 'info');
    logActivity('Cleared cloud API key.');
}

function normalizeCloudDevices(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (raw.data && Array.isArray(raw.data.devices)) return raw.data.devices;
    return [];
}

function renderCloudDevices() {
    const select = $('cloudDeviceSelect');
    if (!select) return;

    const devices = normalizeCloudDevices(state.cloudDevices);
    select.innerHTML = '<option value="">Select a device…</option>';

    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.device || device.device_id || '';
        option.textContent = `${device.deviceName || device.device_name || 'Light'} (${device.model || 'model unknown'})`;
        option.dataset.model = device.model || '';
        select.appendChild(option);
    });
}

async function loadCloudDevices() {
    try {
        ensureNative('Cloud devices');
        const apiKey = getStoredApiKey();
        if (!apiKey) {
            setStatus($('cloudStatus'), 'Save your API key first.', 'error');
            return;
        }
        setStatus($('cloudStatus'), 'Fetching devices from Govee…', 'info');
        const result = await tauriInvoke('govee_cloud_devices', { api_key: apiKey });
        state.cloudDevices = normalizeCloudDevices(result);
        renderCloudDevices();
        setStatus($('cloudStatus'), `Loaded ${state.cloudDevices.length} device(s).`, 'success');
        logActivity(`Cloud devices loaded (${state.cloudDevices.length}).`);
    } catch (error) {
        console.error(error);
        setStatus($('cloudStatus'), error.message || 'Cloud device fetch failed.', 'error');
    }
}

function getSelectedCloudTarget() {
    const select = $('cloudDeviceSelect');
    const selectedId = select?.value || '';
    const manualDevice = ($('cloudDeviceId')?.value || '').trim();
    const manualModel = ($('cloudModel')?.value || '').trim();

    const device = selectedId || manualDevice;
    const model = selectedId ? (select?.selectedOptions?.[0]?.dataset?.model || '') : manualModel;

    if (!device || !model) {
        throw new Error('Select a device and model first.');
    }

    return { device, model };
}

async function sendCloudCommand(cmd) {
    const apiKey = getStoredApiKey();
    if (!apiKey) {
        throw new Error('Save your API key first.');
    }
    ensureNative('Cloud control');

    const target = getSelectedCloudTarget();
    const payload = { api_key: apiKey, device: target.device, model: target.model, cmd };
    await tauriInvoke('govee_cloud_control', payload);
    setStatus($('cloudStatus'), `Cloud: ${cmd.name || cmd.cmd || 'command'} sent.`, 'success');
    logActivity(`Cloud: ${cmd.name || cmd.cmd} → ${target.device}`);
    return target;
}

async function applyCloudPower(desired) {
    try {
        const target = await sendCloudCommand({ name: 'turn', value: desired ? 'on' : 'off' });
        state.lastCloudState = { ...(state.lastCloudState || {}), device: target.device, powerState: desired };
    } catch (error) {
        console.error(error);
        setStatus($('cloudStatus'), error.message || 'Cloud power failed.', 'error');
    }
}

async function toggleCloudPower() {
    const desired = !(state.lastCloudState?.powerState ?? false);
    return applyCloudPower(desired);
}

async function applyCloudBrightness() {
    const level = Number($('cloudBrightness')?.value) || DEFAULT_BRIGHTNESS;
    try {
        await sendCloudCommand({ name: 'brightness', value: level });
        localStorage.setItem(STORAGE_KEYS.brightness, String(level));
    } catch (error) {
        console.error(error);
        setStatus($('cloudStatus'), error.message || 'Cloud brightness failed.', 'error');
    }
}

async function applyCloudColor() {
    const rgb = hexToRgb($('cloudColor')?.value || '#ffffff');
    if (!rgb) {
        setStatus($('cloudStatus'), 'Pick a valid color.', 'error');
        return;
    }
    try {
        await sendCloudCommand({ name: 'color', value: { r: rgb.r, g: rgb.g, b: rgb.b } });
    } catch (error) {
        console.error(error);
        setStatus($('cloudStatus'), error.message || 'Cloud color failed.', 'error');
    }
}

async function fetchCloudState() {
    try {
        ensureNative('Cloud state');
        const apiKey = getStoredApiKey();
        if (!apiKey) {
            setStatus($('cloudStatus'), 'Save your API key first.', 'error');
            return;
        }
        const { device, model } = getSelectedCloudTarget();
        const result = await tauriInvoke('govee_cloud_state', { api_key: apiKey, device, model });
        state.lastCloudState = { ...result, device };
        const output = $('cloudStateOutput');
        if (output) {
            output.textContent = JSON.stringify(result, null, 2);
        }
        setStatus($('cloudStatus'), 'Fetched cloud state.', 'success');
        logActivity(`Cloud state for ${device} loaded.`);
    } catch (error) {
        console.error(error);
        setStatus($('cloudStatus'), error.message || 'Cloud state failed.', 'error');
    }
}

function handlePreset(button) {
    const colorInput = $('lanColor');
    if (!button || !colorInput) return;
    const preset = button.dataset.preset;
    const presets = {
        warm: '#ffe3c4',
        blue: '#7ac3ff',
        sunset: '#ff8c5a',
        white: '#ffffff'
    };
    const color = presets[preset] || '#ffffff';
    colorInput.value = color;
    applyLanColor();
}

function clearActivity() {
    const list = $('activityLog');
    if (!list) return;
    list.innerHTML = '<li class="text-slate-400">No activity yet.</li>';
}

function wireEvents() {
    $('saveLanTarget')?.addEventListener('click', saveLanSettings);
    $('lanOn')?.addEventListener('click', () => handleLanPower(true));
    $('lanOff')?.addEventListener('click', () => handleLanPower(false));
    $('lanToggle')?.addEventListener('click', toggleLanPower);
    $('lanStatusBtn')?.addEventListener('click', refreshLanStatus);
    $('lanApplyBrightness')?.addEventListener('click', applyLanBrightness);
    $('lanApplyColor')?.addEventListener('click', applyLanColor);
    $('lanBrightness')?.addEventListener('input', updateBrightnessLabels);
    $('lanColor')?.addEventListener('change', applyLanColor);

    $('discoverLan')?.addEventListener('click', discoverLanDevices);

    $('saveApiKey')?.addEventListener('click', saveApiKey);
    $('clearApiKey')?.addEventListener('click', clearApiKey);
    $('loadCloudDevices')?.addEventListener('click', loadCloudDevices);
    $('cloudOn')?.addEventListener('click', () => applyCloudPower(true));
    $('cloudOff')?.addEventListener('click', () => applyCloudPower(false));
    $('cloudToggle')?.addEventListener('click', toggleCloudPower);
    $('cloudState')?.addEventListener('click', fetchCloudState);
    $('cloudApplyBrightness')?.addEventListener('click', applyCloudBrightness);
    $('cloudApplyColor')?.addEventListener('click', applyCloudColor);
    $('cloudBrightness')?.addEventListener('input', updateBrightnessLabels);

    $('cloudDeviceSelect')?.addEventListener('change', event => {
        const option = event.target.selectedOptions?.[0];
        if (option && option.value) {
            if ($('cloudDeviceId')) $('cloudDeviceId').value = option.value;
            if ($('cloudModel')) $('cloudModel').value = option.dataset.model || '';
        }
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => handlePreset(btn));
    });

    $('clearActivity')?.addEventListener('click', clearActivity);
}

function init() {
    setRuntimeBanner();
    loadStoredSettings();
    updateBrightnessLabels();
    renderLanStatus(null);
    renderDiscovery();
    wireEvents();

    if (state.isNative) {
        setStatus($('lanStatus'), 'Ready to control lights over LAN.', 'success');
    } else {
        setStatus($('lanStatus'), 'Open the Tauri app to send UDP commands.', 'info');
    }
}

document.addEventListener('DOMContentLoaded', init);
