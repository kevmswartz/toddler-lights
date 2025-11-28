// Roku Control App

const DEFAULT_PIN_CODE = '1234';
const HOLD_DURATION = 2000; // 2 seconds to hold
const PROGRESS_CIRCUMFERENCE = 163;
// STATUS_VARIANTS and INLINE_VARIANTS now defined in lights.js
// const STATUS_VARIANTS = { ... };
// const INLINE_VARIANTS = { ... };
const QUICK_ACTION_COOLDOWN_MS = 1000;
const quickActionCooldowns = new Map();

// Constants now defined in lights.js
// const CONFIG_BASE_PATH = 'config';
// const APP_CONFIG_PATH = `${CONFIG_BASE_PATH}/app-config.json`;
// const APP_CONFIG_CUSTOM_PATH = `${CONFIG_BASE_PATH}/app-config.custom.json`;
// const BUTTON_TYPES_CONFIG_PATH = `${CONFIG_BASE_PATH}/button-types.json`;
// const TODDLER_CONTENT_PASSPHRASE_KEY = 'toddler_content_passphrase';
// const NETLIFY_CONFIG_API_BASE = 'https://toddler-phone-control.netlify.app/api/config';
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 54;
const PARENTAL_PIN_STORAGE_KEY = 'parental_pin';

// TAB_DEFINITIONS now defined in lights.js
// const TAB_DEFINITIONS = { ... };
// TAB_MANAGED_SECTION_IDS now defined in lights.js
// const TAB_MANAGED_SECTION_IDS = ...


// Store latest media data for detailed view
let latestMediaData = null;

// toddlerSpecialButtons and toddlerQuickLaunchItems now defined in lights.js
// let toddlerSpecialButtons = [];
// let toddlerQuickLaunchItems = [];

// toddlerContentSource now defined in lights.js
// let toddlerContentSource = { type: 'bundled', path: APP_CONFIG_PATH };
// buttonTypeCatalog now defined in lights.js
// let buttonTypeCatalog = null;
// tabsConfig now defined in lights.js
// let tabsConfig = null;

// Global definitions for Tauri/Native runtime
// Global definitions for Tauri/Native runtime
// tauriInvoke and isNativeRuntime now defined in tauri-bridge.js/lights.js
// const isNativeRuntime = (typeof window !== 'undefined' && window.isNativeRuntime) || (typeof window !== 'undefined' && window.__TAURI__ !== undefined);
// const tauriInvoke = (typeof window !== 'undefined' && window.tauriInvoke) || (isNativeRuntime && window.__TAURI__ ? window.__TAURI__.invoke : null);



if (typeof window !== 'undefined') {
    window.getButtonHandlerCatalog = () => buttonTypeCatalog;
}

function sanitizePinValue(value) {
    if (typeof value !== 'string') return '';
    const digits = value.replace(/\D/g, '').slice(0, 4);
    return digits.length === 4 ? digits : '';
}

function getLocalParentalPin() {
    const raw = localStorage.getItem(PARENTAL_PIN_STORAGE_KEY);
    if (raw && /^\d{4}$/.test(raw)) {
        return raw;
    }
    return null;
}

function setLocalParentalPin(pin) {
    const sanitized = sanitizePinValue(pin);
    if (sanitized) {
        localStorage.setItem(PARENTAL_PIN_STORAGE_KEY, sanitized);
    } else {
        localStorage.removeItem(PARENTAL_PIN_STORAGE_KEY);
    }
    updateParentalControlsUI();
}

function setRemotePinCode(pin) {
    remotePinCode = pin;
    updateParentalControlsUI();
}



function getActivePinCode() {
    return getLocalParentalPin() || remotePinCode || DEFAULT_PIN_CODE;
}
// Settings lock state
let holdTimer = null;
let holdProgress = 0;
let isHolding = false;
let settingsUnlocked = false;
let currentPin = '';
// toastTimer now defined in lights.js
// let toastTimer = null;
let timerAnimationFrame = null;
let timerEndTimestamp = 0;
let timerDurationMs = 0;
let timerLabelText = '';
let fireworksInterval = null;
let fireworksTimeout = null;
let nativeTtsStatusTimeout = null;
let selectedTimerEmoji = '⭐';
let currentTimerAnimation = 0;
let remotePinCode = null;

function getNativeTtsBridge() {
    if (typeof window === 'undefined') return undefined;
    return window.NativeTts;
}

function showStatus(message, type = 'info') {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) return;

    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }

    const variant = STATUS_VARIANTS[type] || STATUS_VARIANTS.info;

    statusEl.className = `status-message fixed left-1/2 top-6 z-50 -translate-x-1/2 transform rounded-full px-6 py-3 text-sm font-semibold shadow-xl backdrop-blur transition-all duration-300 ${variant.classes}`;
    statusEl.textContent = `${variant.icon} ${message}`;

    statusEl.classList.remove('hidden', 'opacity-0', '-translate-y-full');
    statusEl.classList.add('flex', 'opacity-100', 'translate-y-0');

    toastTimer = setTimeout(() => {
        statusEl.classList.remove('opacity-100', 'translate-y-0');
        statusEl.classList.add('opacity-0', '-translate-y-full');
        setTimeout(() => {
            statusEl.classList.add('hidden');
            statusEl.classList.remove('flex');
        }, 300);
    }, 3000);
}

function buildTabFromDefinition(definition, overrides = {}) {
    if (!definition) return { id: 'unknown', label: 'Unknown', icon: '❓', sections: [] };
    const label = (overrides.customLabel || '').trim();
    const icon = (overrides.customIcon || '').trim();
    return {
        id: definition.id,
        label: label || definition.defaultLabel,
        icon: icon || definition.defaultIcon,
        sections: Array.isArray(definition.sections) ? [...definition.sections] : []
    };
}

async function loadTabsConfig() {
    // Tabs are now loaded as part of the unified app config via loadToddlerContent()
    // This function is kept for backwards compatibility but does nothing
    // since tabsConfig is populated by applyToddlerContent()
}

async function isOnWifi() {
    // In native mode, use the Tauri command to check WiFi (not mobile data)
    if (isNativeRuntime && tauriInvoke) {
        try {
            const connected = await tauriInvoke('is_wifi_connected');
            return connected === true;
        } catch (error) {
            console.warn('Failed to check WiFi status:', error);
            // Fallback to basic online check
            return typeof navigator !== 'undefined' && navigator.onLine !== false;
        }
    }

    // In browser mode, fall back to basic online check
    return typeof navigator !== 'undefined' && navigator.onLine !== false;
}

function getTabsForRendering() {
    let tabs;

    // If we have a loaded config, use it
    if (tabsConfig && Array.isArray(tabsConfig.tabs)) {
        tabs = tabsConfig.tabs.map(tab => ({
            id: tab.id,
            label: tab.label || TAB_DEFINITIONS[tab.id]?.defaultLabel || tab.id,
            icon: tab.icon || TAB_DEFINITIONS[tab.id]?.defaultIcon || '📱',
            // Use sections from TAB_DEFINITIONS since HTML sections are hardcoded
            sections: TAB_DEFINITIONS[tab.id]?.sections || []
        }));
    } else {
        // Fallback to hardcoded tabs
        tabs = [
            buildTabFromDefinition(TAB_DEFINITIONS.remote),
            buildTabFromDefinition(TAB_DEFINITIONS.apps),
            buildTabFromDefinition(TAB_DEFINITIONS.lights),
            buildTabFromDefinition(TAB_DEFINITIONS.magic)
        ];
    }

    // Note: WiFi check is async, filtering happens in renderBottomTabs()
    return tabs;
}

async function getTabsForRenderingFiltered() {
    // WiFi filtering disabled - always show all tabs
    return getTabsForRendering();
}

function getActiveTabId() {
    // Store active tab in a simple variable instead of preferences
    if (!window._activeTabId || !TAB_DEFINITIONS[window._activeTabId]) {
        window._activeTabId = 'remote';
    }
    return window._activeTabId;
}

function updateTabButtonsState(activeTabId) {
    const buttonsContainer = document.getElementById('bottomTabButtons');
    if (!buttonsContainer) return;
    const buttons = buttonsContainer.querySelectorAll('button[data-tab-id]');
    buttons.forEach(button => {
        const isActive = button.dataset.tabId === activeTabId;
        button.setAttribute('data-tab-active', String(isActive));
    });
}

function clearTabVisibility() {
    for (const sectionId of TAB_MANAGED_SECTION_IDS) {
        const sectionEl = document.getElementById(sectionId);
        if (sectionEl) {
            sectionEl.classList.remove('tab-hidden');
        }
    }
}

function applyTabVisibility(activeTabId, availableTabs) {
    // Show only sections for the active tab
    const tabs = Array.isArray(availableTabs) ? availableTabs : getTabsForRendering();
    const activeTab = tabs.find(tab => tab.id === activeTabId) || tabs[0];
    const visibleSections = new Set(activeTab?.sections || []);

    for (const sectionId of TAB_MANAGED_SECTION_IDS) {
        const sectionEl = document.getElementById(sectionId);
        if (!sectionEl) continue;
        if (visibleSections.has(sectionId)) {
            sectionEl.classList.remove('tab-hidden');
        } else {
            sectionEl.classList.add('tab-hidden');
        }
    }
}

function setActiveTab(tabId) {
    const tabs = getTabsForRendering();
    const desired = tabs.some(tab => tab.id === tabId) ? tabId : 'remote';
    window._activeTabId = desired;
    updateTabButtonsState(desired);
    applyTabVisibility(desired, tabs);
}

async function renderBottomTabs() {
    const nav = document.getElementById('bottomTabNav');
    const buttonsContainer = document.getElementById('bottomTabButtons');
    if (!nav || !buttonsContainer) return;

    const tabs = await getTabsForRenderingFiltered();
    nav.classList.remove('hidden');
    buttonsContainer.innerHTML = '';

    const activeTabId = getActiveTabId();

    tabs.forEach(tab => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.tabId = tab.id;
        button.setAttribute('data-tab-active', String(tab.id === activeTabId));
        button.setAttribute('aria-label', tab.label);
        button.className =
            'flex flex-1 flex-col items-center justify-center rounded-2xl px-3 py-3 text-xs font-semibold text-indigo-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/40';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'text-3xl leading-none';
        iconSpan.textContent = tab.icon || '';

        button.appendChild(iconSpan);

        button.addEventListener('click', () => {
            if (tab.id !== getActiveTabId()) {
                setActiveTab(tab.id);
            }
        });

        buttonsContainer.appendChild(button);
    });

    updateTabButtonsState(activeTabId);
    applyTabVisibility(activeTabId, tabs);
}

function initTabControls() {
    // Fixed tabs - just render them
    renderBottomTabs();
}

function getToddlerContentPassphrase() {
    return localStorage.getItem(TODDLER_CONTENT_PASSPHRASE_KEY) || '';
}

function setToddlerContentPassphrase(passphrase) {
    if (passphrase) {
        localStorage.setItem(TODDLER_CONTENT_PASSPHRASE_KEY, passphrase);
    } else {
        localStorage.removeItem(TODDLER_CONTENT_PASSPHRASE_KEY);
    }
    updateToddlerContentSourceInfo();
    updateCloudEditorVisibility();
}

function validatePassphrase(passphrase) {
    const trimmed = passphrase.trim();
    if (!trimmed) return { valid: false, error: 'Passphrase cannot be empty' };

    const words = trimmed.split(/\s+/);
    if (words.length < 5) {
        return { valid: false, error: `Passphrase must have at least 5 words (found ${words.length})` };
    }

    return { valid: true };
}

function buildCloudConfigUrl(passphrase, type = 'app-config') {
    if (!passphrase) return null;
    const encoded = encodeURIComponent(passphrase);
    const typeParam = encodeURIComponent(type);
    return `${NETLIFY_CONFIG_API_BASE}?passphrase=${encoded}&type=${typeParam}`;
}

async function saveDeviceListToCloud(devices, type = 'ble') {
    const passphrase = getToddlerContentPassphrase().trim();
    if (!passphrase) {
        console.log('No passphrase set, skipping cloud save for device list');
        return false;
    }

    const endpoint = type === 'ble'
        ? `${NETLIFY_CONFIG_API_BASE}/${type}-devices.json`
        : `${NETLIFY_CONFIG_API_BASE}/${type}-devices.json`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${passphrase}`
            },
            body: JSON.stringify({
                devices: devices,
                timestamp: new Date().toISOString(),
                deviceCount: devices.length
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error(`Failed to save ${type} devices to cloud:`, error);
            return false;
        }

        const result = await response.json();
        console.log(`✅ Saved ${result.deviceCount} ${type} devices to cloud`);
        return true;
    } catch (error) {
        console.error(`Error saving ${type} devices to cloud:`, error);
        return false;
    }
}

function updateToddlerContentSourceInfo() {
    const info = document.getElementById('toddlerContentCacheInfo');
    const passphraseInput = document.getElementById('toddlerContentPassphrase');
    const passphrase = getToddlerContentPassphrase().trim();

    if (passphraseInput && passphraseInput !== document.activeElement) {
        passphraseInput.value = passphrase;
    }

    if (!info) return;

    if (passphrase) {
        const wordCount = passphrase.split(/\s+/).length;
        info.textContent = `Using cloud config with your ${wordCount}-word passphrase. Always fetches fresh from Netlify.`;
        return;
    }

    if (toddlerContentSource?.type === 'custom') {
        info.textContent = 'Using local kid-mode override (config/toddler/custom.json).';
    } else if (toddlerContentSource?.type === 'bundled') {
        info.textContent = 'Using bundled kid-mode buttons (config/toddler/default.json).';
    } else if (toddlerContentSource?.type === 'empty') {
        info.textContent = 'No kid-mode buttons available. Check your config files.';
    } else {
        info.textContent = 'No passphrase set. Using bundled default buttons.';
    }
}


function setToddlerContentSource(source) {
    toddlerContentSource = source || { type: 'unknown' };
    updateToddlerContentSourceInfo();
    updateCloudEditorVisibility();
}

function updateCloudEditorVisibility() {
    const editor = document.getElementById('cloudConfigEditor');
    const passphrase = getToddlerContentPassphrase().trim();

    if (editor) {
        // Show editor only if passphrase is set
        editor.classList.toggle('hidden', !passphrase);
    }
}

// currentLoadedConfig now defined in lights.js
// let currentLoadedConfig = null; // Store the current config for editing

function loadCurrentConfigIntoEditor() {
    const textarea = document.getElementById('cloudConfigJson');
    if (!textarea) return;

    // Use the last loaded config, or try to get from toddlerSpecialButtons
    let config;
    if (currentLoadedConfig) {
        config = currentLoadedConfig;
    } else {
        // Rebuild config from current state
        config = {
            tabs: [
                {
                    id: 'remote',
                    label: 'Remote',
                    icon: '🎮',
                    buttons: toddlerSpecialButtons.filter(b => b.category === 'kidMode-remote' || !b.category)
                },
                {
                    id: 'apps',
                    label: 'Roku',
                    icon: '📺',
                    buttons: toddlerSpecialButtons.filter(b => b.category === 'kidMode-content'),
                    quickLaunch: toddlerQuickLaunchItems
                },
                {
                    id: 'lights',
                    label: 'Lights',
                    icon: '💡',
                    buttons: toddlerSpecialButtons.filter(b => b.category === 'lights')
                },
                {
                    id: 'magic',
                    label: 'Magic Time',
                    icon: '⏱️',
                    buttons: toddlerSpecialButtons.filter(b => b.category === 'magic')
                }
            ].filter(tab => tab.buttons.length > 0 || tab.quickLaunch?.length > 0),
            version: '1.0.0',
            lastUpdated: new Date().toISOString()
        };
    }

    textarea.value = JSON.stringify(config, null, 2);
    showStatus('Current config loaded into editor. Make your changes and click Save to Cloud.', 'info');
}

function validateConfigJson() {
    const textarea = document.getElementById('cloudConfigJson');
    if (!textarea) return false;

    try {
        const config = JSON.parse(textarea.value);

        // Basic validation
        if (!config.tabs || !Array.isArray(config.tabs)) {
            showStatus('Invalid config: must have a "tabs" array.', 'error');
            return false;
        }

        showStatus(`Valid JSON! Found ${config.tabs.length} tabs.`, 'success');
        return true;
    } catch (error) {
        showStatus(`Invalid JSON: ${error.message}`, 'error');
        return false;
    }
}

async function saveConfigToCloud() {
    const textarea = document.getElementById('cloudConfigJson');
    const passphrase = getToddlerContentPassphrase().trim();

    if (!passphrase) {
        showStatus('No passphrase set. Enter a passphrase first.', 'error');
        return;
    }

    if (!textarea || !textarea.value.trim()) {
        showStatus('Editor is empty. Load current config or paste your JSON first.', 'error');
        return;
    }

    // Validate JSON first
    let config;
    try {
        config = JSON.parse(textarea.value);
    } catch (error) {
        showStatus(`Invalid JSON: ${error.message}`, 'error');
        return;
    }

    // Basic validation
    if (!config.tabs || !Array.isArray(config.tabs)) {
        showStatus('Invalid config: must have a "tabs" array.', 'error');
        return;
    }

    try {
        showStatus('Saving to cloud...', 'info');

        const response = await fetch(NETLIFY_CONFIG_API_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${passphrase}`
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        showStatus('Config saved to cloud! Refreshing...', 'success');

        // Reload from cloud to verify
        await loadToddlerContent({ forceRefresh: true });

        // Update editor with the freshly loaded config (includes new lastUpdated timestamp)
        const editorTextarea = document.getElementById('cloudConfigJson');
        if (editorTextarea && currentLoadedConfig) {
            editorTextarea.value = JSON.stringify(currentLoadedConfig, null, 2);
        }

        showStatus('Config saved and refreshed successfully!', 'success');
    } catch (error) {
        console.error('Failed to save config to cloud:', error);
        showStatus(`Failed to save: ${error.message}`, 'error');
    }
}

function normalizeQuickLaunchItem(item) {
    // Auto-generate missing fields for quick launch items
    const normalized = { ...item };

    // Auto-generate id if not provided
    if (!normalized.id) {
        if (normalized.type === 'youtube' && normalized.videoId) {
            normalized.id = `yt-${normalized.videoId}`;
        } else {
            // Fallback: generate from label or random
            normalized.id = normalized.label ? `ql-${normalized.label.toLowerCase().replace(/\s+/g, '-')}` : `ql-${Date.now()}`;
        }
    }

    // Auto-generate thumbnail for youtube if not provided
    if (normalized.type === 'youtube' && normalized.videoId && !normalized.thumbnail) {
        normalized.thumbnail = `https://img.youtube.com/vi/${normalized.videoId}/maxresdefault.jpg`;
    }

    // Default label to empty string
    if (!normalized.label) {
        normalized.label = '';
    }

    return normalized;
}

function applyToddlerContent(data) {
    // Store the raw config for editing
    currentLoadedConfig = data;

    const settingsData = data?.settings || {};

    if (Object.prototype.hasOwnProperty.call(settingsData, 'parentalPin')) {
        setRemotePinCode(settingsData.parentalPin);
    } else {
        setRemotePinCode(null);
    }

    // Extract tabs and buttons from the unified config structure
    const tabs = Array.isArray(data?.tabs) ? data.tabs : [];

    // Store tabs config for navigation
    tabsConfig = { tabs };

    const remoteTab = tabs.find(tab => tab.id === 'remote');
    const appsTab = tabs.find(tab => tab.id === 'apps');
    const magicTab = tabs.find(tab => tab.id === 'magic');

    const remoteButtons = Array.isArray(remoteTab?.buttons) ? [...remoteTab.buttons] : [];
    const appsButtons = Array.isArray(appsTab?.buttons) ? [...appsTab.buttons] : [];
    const magicButtons = Array.isArray(magicTab?.buttons) ? [...magicTab.buttons] : [];

    // Normalize quick launch items (auto-generate id, thumbnail, etc.)
    const rawQuickLaunch = Array.isArray(appsTab?.quickLaunch) ? appsTab.quickLaunch : [];
    toddlerQuickLaunchItems = rawQuickLaunch.map(normalizeQuickLaunchItem);

    // Combine remote and apps buttons for rendering
    toddlerSpecialButtons = [...remoteButtons, ...appsButtons, ...magicButtons];

    renderToddlerButtons(remoteButtons, appsButtons, toddlerQuickLaunchItems);
    renderMagicButtons(magicButtons);
    renderQuickLaunchSettings(toddlerQuickLaunchItems);
}

async function fetchToddlerContentFromUrl(url) {


    // Fallback to browser fetch for web mode or if native fails
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
}

async function tryFetchToddlerContentFromPath(path) {
    try {
        const response = await fetch(path, { cache: 'no-store' });
        if (response.status === 404) {
            return null;
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // Check content type - if it's HTML, this is likely a 404 page
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            return null;
        }

        return await response.json();
    } catch (error) {
        // Only warn if this isn't an expected missing custom.json
        if (!path.includes('custom.json')) {
            console.warn(`Failed to read kid-mode config from ${path}:`, error);
        }
        return null;
    }
}

async function fetchLocalToddlerContent() {
    const lookupOrder = [
        { type: 'custom', path: APP_CONFIG_CUSTOM_PATH },
        { type: 'bundled', path: APP_CONFIG_PATH }
    ];

    for (const candidate of lookupOrder) {
        const data = await tryFetchToddlerContentFromPath(candidate.path);
        if (data) {
            return { data, source: candidate };
        }
    }

    return null;
}

async function loadButtonTypeCatalog() {
    const container = document.getElementById('buttonHandlerCatalog');
    if (!container) return;

    try {
        const response = await fetch(BUTTON_TYPES_CONFIG_PATH, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        buttonTypeCatalog = await response.json();
        renderButtonTypeCatalog(buttonTypeCatalog);
    } catch (error) {
        console.warn('Failed to load button type catalog:', error);
        container.classList.add('hidden');
    }
}

function renderButtonTypeCatalog(catalog) {
    const container = document.getElementById('buttonHandlerCatalog');
    const buttonList = document.getElementById('buttonHandlerList');
    const providerList = document.getElementById('contentProviderList');
    if (!container || !buttonList || !providerList) return;

    buttonList.innerHTML = '';
    providerList.innerHTML = '';

    const buttonTypes = Array.isArray(catalog?.buttonTypes) ? catalog.buttonTypes : [];
    const providers = Array.isArray(catalog?.contentProviders) ? catalog.contentProviders : [];

    if (buttonTypes.length) {
        buttonTypes.forEach(def => {
            const card = document.createElement('div');
            card.className = 'rounded-2xl bg-white/5 p-4 text-sm text-indigo-100 shadow-inner';

            const title = document.createElement('h3');
            title.className = 'text-base font-semibold text-white';
            title.textContent = def.type;

            const description = document.createElement('p');
            description.className = 'mt-2 text-xs text-indigo-100/80';
            description.textContent = def.description || 'Add custom kid-mode buttons using this type.';

            const handlerList = document.createElement('ul');
            handlerList.className = 'mt-3 space-y-1 text-xs font-semibold text-indigo-100';

            (Array.isArray(def.handlers) ? def.handlers : []).forEach(handler => {
                const item = document.createElement('li');
                item.textContent = handler;
                handlerList.appendChild(item);
            });

            card.append(title, description, handlerList);
            buttonList.appendChild(card);
        });
    } else {
        const empty = document.createElement('p');
        empty.className = 'rounded-2xl bg-white/5 p-4 text-xs text-indigo-100/80';
        empty.textContent = 'No handler catalog available.';
        buttonList.appendChild(empty);
    }

    if (providers.length) {
        providers.forEach(provider => {
            const row = document.createElement('div');
            row.className = 'rounded-2xl bg-white/5 p-3 text-xs text-indigo-100';

            const heading = document.createElement('div');
            heading.className = 'font-semibold text-white';
            heading.textContent = provider.type;

            const details = document.createElement('p');
            details.className = 'mt-1 text-indigo-100/80';
            const handlerNames = Array.isArray(provider.sourceButtons) ? provider.sourceButtons.join(', ') : 'No handlers listed';
            const availability = provider.availableByDefault ? 'available by default' : 'enable manually';
            details.textContent = `Handlers: ${handlerNames} • ${availability}`;

            const notes = document.createElement('p');
            notes.className = 'mt-2 text-[11px] text-indigo-100/70';
            notes.textContent = provider.notes || '';

            row.append(heading, details, notes);
            providerList.appendChild(row);
        });
    } else {
        const fallback = document.createElement('p');
        fallback.className = 'rounded-2xl bg-white/5 p-3 text-xs text-indigo-100/80';
        fallback.textContent = 'No content provider metadata available.';
        providerList.appendChild(fallback);
    }

    container.classList.toggle('hidden', !buttonTypes.length && !providers.length);
}

async function saveToddlerContentPassphrase() {
    const input = document.getElementById('toddlerContentPassphrase');
    if (!input) return;

    const rawPassphrase = input.value.trim();
    if (rawPassphrase) {
        // Validate passphrase
        const validation = validatePassphrase(rawPassphrase);
        if (!validation.valid) {
            showStatus(validation.error, 'error');
            return;
        }
        setToddlerContentPassphrase(rawPassphrase);
        await loadToddlerContent({ forceRefresh: true });
        showStatus(`Passphrase saved! Loading config from cloud...`, 'success');
    } else {
        setToddlerContentPassphrase('');
        await loadToddlerContent({ forceRefresh: true });
        showStatus('Passphrase cleared. Using bundled defaults.', 'info');
    }
}

async function refreshToddlerContent() {
    await loadToddlerContent({ forceRefresh: true });
}

function clearToddlerContentPassphrase() {
    setToddlerContentPassphrase('');
    showStatus('Reloading with bundled buttons...', 'info');
    loadToddlerContent({ forceRefresh: true });
}

function getQuickActionKey(source) {
    if (!source) return '__quick_action__';
    if (typeof source === 'string') return source;
    return source.id || source.appId || source.appName || source.label || '__quick_action__';
}

function registerQuickActionCooldown(source) {
    const key = getQuickActionKey(source);
    const now = Date.now();
    const last = quickActionCooldowns.get(key) || 0;
    if (now - last < QUICK_ACTION_COOLDOWN_MS) {
        return false;
    }
    quickActionCooldowns.set(key, now);
    return true;
}

function handleMagicTimerStart(durationSeconds) {
    const seconds = Number(durationSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
        showStatus('Pick a timer length to get started.', 'error');
        return;
    }

    const minutes = seconds / 60;
    const label =
        minutes >= 1
            ? `${Math.round(minutes * 10) / 10} minute timer`
            : `${seconds} second timer`;
    startToddlerTimer(seconds, label);
}

function handleMagicFireworks() {
    startFireworksShow(8, 'Fireworks Celebration!');
}

function handleMagicSpeak(text) {
    const phrase = typeof text === 'string' ? text.trim() : '';
    if (!phrase) {
        showStatus('Type something to say first.', 'error');
        return false;
    }
    speakTts(phrase);
    return true;
}

function stopMagicSpeak() {
    const nativeBridge = getNativeTtsBridge();
    try {
        if (nativeBridge?.stop) {
            nativeBridge.stop();
        }
    } catch (error) {
        console.warn('Native TTS stop failed', error);
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
        } catch (error) {
            console.warn('Speech synthesis cancel failed', error);
        }
    }

    showStatus('Voice stopped.', 'info');
}

function initMagicControls() {
    const quickButtons = document.querySelectorAll('[data-magic-timer]');
    quickButtons.forEach(button => {
        if (!button.__magicTimerBound) {
            button.__magicTimerBound = true;
            button.addEventListener('click', () => handleMagicTimerStart(button.dataset.magicTimer));
        }
    });

    const customMinutesInput = document.getElementById('magicTimerMinutes');
    const timerForm = document.getElementById('magicTimerForm');
    if (timerForm && !timerForm.__magicSubmitBound) {
        timerForm.__magicSubmitBound = true;
        timerForm.addEventListener('submit', event => {
            event.preventDefault();
            const minutesRaw = customMinutesInput ? Number(customMinutesInput.value) : NaN;
            if (!Number.isFinite(minutesRaw) || minutesRaw <= 0) {
                showStatus('Enter the number of minutes for the timer.', 'error');
                return;
            }
            handleMagicTimerStart(minutesRaw * 60);
        });
    }

    const cancelButton = document.getElementById('magicTimerCancel');
    if (cancelButton && !cancelButton.__magicCancelBound) {
        cancelButton.__magicCancelBound = true;
        cancelButton.addEventListener('click', () => cancelToddlerTimer());
    }

    const fireworksButton = document.getElementById('magicFireworksButton');
    if (fireworksButton && !fireworksButton.__magicFireworksBound) {
        fireworksButton.__magicFireworksBound = true;
        fireworksButton.addEventListener('click', () => handleMagicFireworks());
    }

    // Timer emoji selection
    const emojiButtons = document.querySelectorAll('[data-timer-emoji]');
    emojiButtons.forEach(button => {
        if (!button.__emojiSelectBound) {
            button.__emojiSelectBound = true;
            button.addEventListener('click', () => {
                const emoji = button.dataset.timerEmoji;
                selectedTimerEmoji = emoji || '⭐';

                // Update UI to show selected
                emojiButtons.forEach(btn => btn.setAttribute('data-selected', 'false'));
                button.setAttribute('data-selected', 'true');
            });
        }
    });

    // Set first emoji as selected by default
    if (emojiButtons.length > 0 && !emojiButtons[0].dataset.selected) {
        emojiButtons[0].setAttribute('data-selected', 'true');
    }

    const speakForm = document.getElementById('magicSpeakForm');
    const speakInput = document.getElementById('magicSpeakInput');
    if (speakForm && !speakForm.__magicSpeakBound) {
        speakForm.__magicSpeakBound = true;
        speakForm.addEventListener('submit', event => {
            event.preventDefault();
            const phrase = speakInput ? speakInput.value : '';
            const spoke = handleMagicSpeak(phrase);
            if (spoke && speakInput) {
                speakInput.value = '';
                speakInput.focus();
            }
        });
    }

    const stopSpeakButton = document.getElementById('magicSpeakStop');
    if (stopSpeakButton && !stopSpeakButton.__magicStopBound) {
        stopSpeakButton.__magicStopBound = true;
        stopSpeakButton.addEventListener('click', () => stopMagicSpeak());
    }
}

// Initialize on load
async function discoverAndRegisterAllDevices() {
    if (!isNativeRuntime || !tauriInvoke) {
        console.log('Skipping device discovery (not native)');
        return;
    }

    showStatus('Looking for devices...', 'info');

    try {
        // Run discovery for Roku
        // Note: Assuming 'roku_discover' returns a list of devices
        const rokuDevices = await tauriInvoke('roku_discover').catch(err => {
            // console.warn('Roku discovery failed:', err);
            return [];
        });

        // Run discovery for Govee (if supported)
        const goveeDevices = await tauriInvoke('govee_discover').catch(err => {
            console.warn('Govee discovery failed:', err);
            return [];
        });

        const registry = getDeviceRegistry();
        let newCount = 0;

        // Update registry
        if (Array.isArray(rokuDevices)) {
            rokuDevices.forEach(device => {
                if (!registry.roku[device.id]) newCount++;
                registry.roku[device.id] = device;
            });
        }

        if (Array.isArray(goveeDevices)) {
            goveeDevices.forEach(device => {
                if (!registry.govee[device.id]) newCount++;
                registry.govee[device.id] = device;
            });
        }

        saveDeviceRegistry(registry);

        // Save to cloud if possible and if we found something
        if (newCount > 0 || Object.keys(registry.roku).length > 0) {
            await saveDeviceListToCloud(Object.values(registry.roku), 'roku');
            await saveDeviceListToCloud(Object.values(registry.govee), 'govee');
        }

        if (newCount > 0) {
            showStatus(`Found ${newCount} new devices!`, 'success');
        } else {
            console.log('Discovery complete. No new devices found.');
        }
    } catch (error) {
        console.error('Discovery process failed:', error);
        showStatus('Device discovery failed.', 'error');
    }
}

async function launchConfiguredApp(config) {
    if (!config) return;

    const appId = config.appId;
    const params = config.params || {};

    if (isNativeRuntime && tauriInvoke) {
        try {
            await tauriInvoke('roku_launch_app', { appId, params });
            // showStatus(`Launched ${config.label || 'App'}`, 'success');
        } catch (error) {
            console.error('Failed to launch app:', error);
            showStatus('Failed to launch app on TV.', 'error');
        }
    } else {
        console.log('Mock launch app:', appId, params);
        showStatus(`(Demo) Launching ${config.label || appId}...`, 'success');
    }
}

async function launchSpecificYouTube(videoId) {
    if (!videoId) return;

    const config = {
        appId: '837', // Standard YouTube App ID on Roku
        label: 'YouTube',
        params: { contentId: videoId, mediaType: 'live' }
    };

    await launchConfiguredApp(config);
}

// DOMContentLoaded listener now handled in lights.js
/*
window.addEventListener('DOMContentLoaded', async () => {
    // Log runtime info for debugging
    if (isNativeRuntime) {
        console.log('Running inside Tauri shell');
    }

    updateParentalControlsUI();

    // Load tabs config before initializing tab controls
    await loadTabsConfig();
    initTabControls();
    initMagicControls();
    updateToddlerContentSourceInfo();
    updateCloudEditorVisibility();
    void loadButtonTypeCatalog();

    await loadToddlerContent();

    // Run device discovery at startup only if on WiFi
    if (isNativeRuntime && await isOnWifi()) {
        discoverAndRegisterAllDevices().catch(err => {
            console.warn('Startup discovery failed:', err);
        });
    }

    // Listen for network connectivity changes
    window.addEventListener('online', async () => {
        console.log('Network connection changed');
        await renderBottomTabs(); // Re-render tabs (show Roku tab if on WiFi)
        // Trigger device discovery if on WiFi
        if (isNativeRuntime && await isOnWifi()) {
            console.log('WiFi detected, running device discovery');
            discoverAndRegisterAllDevices().catch(err => {
                console.warn('Online discovery failed:', err);
            });
        }
    });

    window.addEventListener('offline', async () => {
        console.log('Network connection lost');
    });

    // Initialize room detection system
    await loadRoomConfig();
    updateRoomUI();

    // Start auto room detection if enabled
    if (typeof roomConfig !== 'undefined' && roomConfig?.settings?.autoDetect && isNativeRuntime) {
        startRoomDetection();
    }
});
*/

async function loadToddlerContent({ forceRefresh = false } = {}) {
    const passphrase = getToddlerContentPassphrase().trim();

    // If passphrase is configured, try fetching from cloud (always fresh, no cache)
    if (passphrase) {
        const cloudUrl = buildCloudConfigUrl(passphrase);
        if (cloudUrl) {
            try {
                const remoteData = await fetchToddlerContentFromUrl(cloudUrl);
                setToddlerContentSource({ type: 'cloud', passphrase: '***' }); // Don't expose passphrase
                applyToddlerContent(remoteData);
                showStatus('Kid-mode buttons loaded from cloud.', 'success');
                return;
            } catch (error) {
                console.error('Failed to fetch cloud toddler content:', error);
                showStatus('Cloud config failed. Falling back to local config.', 'error');
                // Fall through to local loading
            }
        }
    }

    // Load from local files (custom.json or default.json)
    const localContent = await fetchLocalToddlerContent();
    if (localContent) {
        setToddlerContentSource(localContent.source);
        applyToddlerContent(localContent.data);
        if (!passphrase) {
            // No passphrase configured - this is the primary source
            if (localContent.source.type === 'custom') {
                showStatus('Kid-mode buttons loaded from local override.', 'info');
            } else {
                showStatus('Kid-mode buttons loaded from bundled defaults.', 'info');
            }
        }
        return;
    }

    // Complete failure - no content available
    console.error('Failed to load kid-mode buttons from any source.');
    setToddlerContentSource({ type: 'empty' });
    applyToddlerContent({ tabs: [] });
    showStatus('Could not load kid-mode buttons. Check your config files.', 'error');
}

function renderToddlerButtons(remoteButtons = [], appsButtons = [], quickLaunch = []) {
    const quickColumn = document.getElementById('toddlerQuickColumn');
    if (!quickColumn) return;

    quickColumn.innerHTML = '';

    // Separate apps buttons by whether they have thumbnails
    const appsButtonsWithImages = appsButtons.filter(btn => btn.thumbnail);
    const appsButtonsNoImages = appsButtons.filter(btn => !btn.thumbnail);

    // Combine quick launch items with apps buttons (images first, then no-image buttons)
    const quickItems = [
        ...(Array.isArray(quickLaunch) ? quickLaunch.map(mapQuickLaunchToToddlerButton) : []),
        ...appsButtonsWithImages,
        ...appsButtonsNoImages
    ];

    if (quickItems.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'col-span-full rounded-3xl bg-white/10 px-6 py-8 text-center text-lg font-semibold text-indigo-100';
        emptyState.textContent = 'No kid buttons configured yet.';
        quickColumn.appendChild(emptyState);
    } else {
        quickItems.forEach(config => {
            const element = createQuickButtonElement(config);
            if (element) {
                quickColumn.appendChild(element);
            }
        });
    }
}



function renderMagicButtons(buttons = []) {
    const column = document.getElementById('magicButtonColumn');
    if (!column) return;

    column.innerHTML = '';

    if (buttons.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'col-span-full rounded-3xl bg-white/10 px-6 py-8 text-center text-lg font-semibold text-indigo-100';
        emptyState.textContent = 'No magic buttons configured yet.';
        column.appendChild(emptyState);
    } else {
        buttons.forEach(config => {
            const element = createQuickButtonElement(config);
            if (element) {
                column.appendChild(element);
            }
        });
    }
}

function mapQuickLaunchToToddlerButton(item) {
    const buttonLabel = item.label || '';
    return {
        id: item.id ? `${item.id}-button` : undefined,
        label: buttonLabel,
        thumbnail: item.thumbnail || '',
        launchItem: item
    };
}

function createQuickButtonElement(config) {
    const isQuickLaunch = Boolean(config.launchItem);
    const hasThumbnail = Boolean(config.thumbnail);

    const buttonEl = document.createElement('button');
    buttonEl.type = 'button';
    buttonEl.className = hasThumbnail
        ? 'group relative overflow-hidden rounded-3xl shadow-xl transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-white/40 active:scale-[0.98] touch-manipulation select-none aspect-[16/9]'
        : 'flex min-h-[11rem] flex-col items-center justify-center gap-4 rounded-3xl bg-white text-indigo-600 shadow-xl transition hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-white/50 active:scale-95 touch-manipulation select-none';

    if (config.id) {
        buttonEl.id = config.id;
    }

    if (config.label) {
        buttonEl.setAttribute('aria-label', config.label);
    }

    const clickHandler = () => {
        if (isQuickLaunch) {
            handleQuickLaunch(config.launchItem);
        } else {
            invokeToddlerHandler(config);
        }
    };

    buttonEl.addEventListener('click', clickHandler);

    if (hasThumbnail) {
        const img = document.createElement('img');
        img.src = config.thumbnail || '';
        img.alt = config.label || 'Quick launch';
        img.loading = 'lazy';
        img.className = 'absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105';

        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 bg-black/20 transition duration-300 group-hover:bg-black/35 pointer-events-none';

        const label = document.createElement('span');
        label.className = 'absolute bottom-4 left-1/2 w-[85%] -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-center text-sm font-semibold uppercase tracking-wide text-white shadow-lg';
        label.textContent = config.label || 'Watch';

        buttonEl.append(img, overlay, label);
    } else {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'text-5xl';
        iconSpan.textContent = config.emoji || '🔘';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'text-2xl font-extrabold tracking-tight text-indigo-700';
        if (config.favoriteLabelId) {
            labelSpan.id = config.favoriteLabelId;
        }
        labelSpan.textContent = config.label || 'Button';

        buttonEl.append(iconSpan, labelSpan);
    }

    return buttonEl;
}







function invokeToddlerHandler(config) {
    if (config?.launchItem) {
        handleQuickLaunch(config.launchItem);
        return;
    }

    if (config?.appId || config?.appName) {
        if (!registerQuickActionCooldown(config)) {
            showStatus('Hang on, that action is already starting...', 'info');
            return;
        }
        const announceName = (config.appName || config.label || '').trim();
        if (announceName) {
            speakTts(`Opening ${announceName}`);
        }
        launchConfiguredApp(config);
        return;
    }

    const handlerName = config?.handler;
    if (!handlerName) {
        console.warn('Toddler button missing handler:', config);
        return;
    }

    const handler = window[handlerName];
    if (typeof handler !== 'function') {
        console.warn(`Handler "${handlerName}" is not available for toddler button.`);
        showStatus('That action is not ready yet.', 'error');
        return;
    }

    let args = Array.isArray(config.args)
        ? config.args
        : config.args !== undefined
            ? [config.args]
            : [];

    // Allow new lightRoutine configs to pass their steps without duplicating data in args
    if (
        handlerName === 'lightRoutine' &&
        Array.isArray(config.routine) &&
        config.routine.length > 0 &&
        args.length === 0
    ) {
        args = [config.routine];
    }

    try {
        handler(...args);
    } catch (error) {
        console.error(`Error running handler "${handlerName}"`, error);
        showStatus('Could not run that action. Try again.', 'error');
    }
}

function renderQuickLaunch(items) {
    renderQuickLaunchSettings(items);
}

function renderQuickLaunchSettings(items) {
    const section = document.getElementById('quickLaunchSection');
    const grid = document.getElementById('quickLaunchGrid');
    if (!section || !grid) return;

    grid.innerHTML = '';

    const launches = Array.isArray(items) ? [...items] : [];
    if (launches.length === 0) {
        section.classList.add('hidden');
        return;
    }

    launches.forEach(item => {
        const button = document.createElement('button');
        button.className = 'group relative overflow-hidden rounded-3xl shadow-lg transition hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-white/40 active:scale-[0.98] touch-manipulation select-none';
        button.type = 'button';

        if (item.id) {
            button.id = item.id;
        }

        button.addEventListener('click', () => handleQuickLaunch(item));

        const img = document.createElement('img');
        img.src = item.thumbnail || '';
        img.alt = item.label || 'Quick launch item';
        img.loading = 'lazy';
        img.className = 'h-full w-full object-cover transition duration-300 group-hover:scale-105';

        button.appendChild(img);

        const captionLabel = item.label || '';
        if (captionLabel) {
            const caption = document.createElement('span');
            caption.className = 'pointer-events-none absolute bottom-3 left-1/2 w-[85%] -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide text-white shadow-lg';
            caption.textContent = captionLabel;
            button.appendChild(caption);
        }

        grid.appendChild(button);
    });

    if (settingsUnlocked) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
    }
}

function handleQuickLaunch(item) {
    if (!item) return;

    if (!registerQuickActionCooldown(item)) {
        showStatus('Hang on, that action is already starting...', 'info');
        return;
    }

    const announceLabel = (item.label || item.appName || '').trim();
    if (announceLabel) {
        const quickType = (item.type || '').toLowerCase();
        const verb = quickType === 'youtube' || quickType === 'video' ? 'Playing' : 'Opening';
        speakTts(`${verb} ${announceLabel}`);
    }

    if (item.type === 'youtube' && item.videoId) {
        launchSpecificYouTube(item.videoId);
        return;
    }

    const handlerName = item.handler;
    if (handlerName && typeof window[handlerName] === 'function') {
        const args = Array.isArray(item.args) ? item.args : item.args !== undefined ? [item.args] : [];
        try {
            window[handlerName](...args);
            return;
        } catch (error) {
            console.error(`Quick launch handler "${handlerName}" failed`, error);
            showStatus('Quick launch failed. Try again.', 'error');
            return;
        }
    }

    showStatus('Quick launch is missing an action.', 'error');
}

function speakTts(message = '') {
    const text = typeof message === 'string' ? message.trim() : '';

    if (!text) {
        showStatus('Nothing to say yet.', 'error');
        return;
    }

    const nativeBridge = getNativeTtsBridge();
    if (nativeBridge?.speak) {
        try {
            if (typeof nativeBridge.stop === 'function') {
                nativeBridge.stop();
            }

            if (nativeTtsStatusTimeout) {
                clearTimeout(nativeTtsStatusTimeout);
                nativeTtsStatusTimeout = null;
            }

            const ready = typeof nativeBridge.isReady === 'function' ? Boolean(nativeBridge.isReady()) : true;
            const success = nativeBridge.speak(text);

            if (!success) {
                showStatus('Could not speak that phrase.', 'error');
                return;
            }

            showStatus(ready ? `Saying "${text}"...` : 'Warming up the voice...', 'info');

            nativeTtsStatusTimeout = setTimeout(() => {
                showStatus(`Said: "${text}"`, 'success');
                nativeTtsStatusTimeout = null;
            }, ready ? 1400 : 2000);
            return;
        } catch (error) {
            console.error('Native TTS error', error);
            showStatus('Could not speak that phrase.', 'error');
            return;
        }
    }

    if (!('speechSynthesis' in window)) {
        showStatus('Your browser cannot talk yet. Try another device.', 'error');
        return;
    }

    try {
        const synth = window.speechSynthesis;
        synth.cancel();

        const speakWithVoices = () => {
            const voices = synth.getVoices();
            if (!voices || voices.length === 0) {
                showStatus('Loading voices...', 'info');
                synth.onvoiceschanged = () => {
                    synth.onvoiceschanged = null;
                    speakWithVoices();
                };
                return;
            }

            const voiceList = [...voices];
            const isEnUs = voice => (voice.lang || '').toLowerCase().includes('en-us');
            const femaleNames = voiceList.filter(voice => /female|woman|girl|amy|aria|emma|olivia|salli|joanna|linda|allison|nicole|kendra|kimberly/i.test(voice.name));
            const preferred = femaleNames.find(isEnUs)
                || voiceList.find(isEnUs)
                || femaleNames[0]
                || voiceList.find(voice => (voice.lang || '').toLowerCase().startsWith('en'))
                || voiceList[0];

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1;
            utterance.pitch = 1;
            if (preferred) utterance.voice = preferred;
            utterance.onend = () => showStatus(`Said: "${text}"`, 'success');
            utterance.onerror = event => {
                console.error('Speech synthesis error', event);
                showStatus('Could not speak that phrase.', 'error');
            };

            synth.speak(utterance);
            showStatus(`Saying "${text}"...`, 'info');
        };

        speakWithVoices();
    } catch (error) {
        console.error('Speech synthesis exception', error);
        showStatus('Could not speak that phrase.', 'error');
    }
}

function applyTimerAnimation(element) {
    if (!element) return;

    const animations = [
        'spin 3s linear infinite',
        'pulse-grow 2s ease-in-out infinite',
        'bounce-float 2s ease-in-out infinite',
        'rotate-pulse 3s ease-in-out infinite',
        'wiggle 1s ease-in-out infinite',
        'rainbow-glow 3s linear infinite'
    ];

    element.style.animation = animations[currentTimerAnimation];
}

function setupTimerOverlayEmojiButtons() {
    const overlayEmojiButtons = document.querySelectorAll('#timerOverlay [data-timer-emoji]');

    overlayEmojiButtons.forEach(button => {
        if (!button.__timerOverlayBound) {
            button.__timerOverlayBound = true;
            button.addEventListener('click', () => {
                const emoji = button.dataset.timerEmoji;
                selectedTimerEmoji = emoji || '⭐';

                // Update the spinner emoji
                const spinnerEmoji = document.getElementById('timerSpinnerEmoji');
                if (spinnerEmoji) {
                    spinnerEmoji.textContent = selectedTimerEmoji;
                }

                // Cycle to next animation
                currentTimerAnimation = (currentTimerAnimation + 1) % 6;
                applyTimerAnimation(spinnerEmoji);

                // Update selected state
                overlayEmojiButtons.forEach(btn => btn.setAttribute('data-selected', 'false'));
                button.setAttribute('data-selected', 'true');
            });
        }
    });

    // Set currently selected emoji
    const currentEmojiButton = Array.from(overlayEmojiButtons).find(
        btn => btn.dataset.timerEmoji === selectedTimerEmoji
    );
    if (currentEmojiButton) {
        overlayEmojiButtons.forEach(btn => btn.setAttribute('data-selected', 'false'));
        currentEmojiButton.setAttribute('data-selected', 'true');
    }
}

function startToddlerTimer(durationSeconds = 300, label = 'Timer') {
    const secondsValue = Number(Array.isArray(durationSeconds) ? durationSeconds[0] : durationSeconds);
    const labelValue = Array.isArray(durationSeconds) && durationSeconds.length > 1 ? durationSeconds[1] : label;
    const displayLabel = typeof labelValue === 'string' && labelValue.trim().length > 0 ? labelValue.trim() : 'Timer';

    const overlay = document.getElementById('timerOverlay');
    const originalTimeEl = document.getElementById('timerOriginalTime');
    const spinnerEmoji = document.getElementById('timerSpinnerEmoji');
    if (!overlay) {
        console.warn('Timer overlay elements are missing.');
        return;
    }

    const sanitizedSeconds = Number.isFinite(secondsValue) && secondsValue > 0 ? secondsValue : 300;

    cancelToddlerTimer({ silent: true });

    timerDurationMs = sanitizedSeconds * 1000;
    timerEndTimestamp = Date.now() + timerDurationMs;
    timerLabelText = displayLabel || 'Timer';

    // Display original time
    if (originalTimeEl) {
        const minutes = Math.floor(sanitizedSeconds / 60);
        const seconds = sanitizedSeconds % 60;
        const timeStr = seconds > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${minutes}:00`;
        originalTimeEl.textContent = timeStr;
    }

    if (spinnerEmoji) {
        spinnerEmoji.textContent = selectedTimerEmoji;
        applyTimerAnimation(spinnerEmoji);
    }

    // Set up emoji button listeners in overlay
    setupTimerOverlayEmojiButtons();

    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('timer-open');
    }
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    updateToddlerTimerDisplay();
    showStatus(`Started ${timerLabelText} for ${formatTimerDuration(sanitizedSeconds)}.`, 'success');
}

function formatTimerDuration(totalSeconds = 0) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.max(0, Math.round(totalSeconds % 60));
    const minutePart = minutes > 0 ? `${minutes} min` : '';
    const secondPart = seconds > 0 ? `${seconds} sec` : '';
    return `${minutePart} ${secondPart}`.trim() || '0 sec';
}

function updateToddlerTimerDisplay() {
    const overlay = document.getElementById('timerOverlay');
    const countdownEl = document.getElementById('timerCountdown');
    if (!overlay || overlay.classList.contains('hidden')) {
        return;
    }

    const now = Date.now();
    const remainingMs = Math.max(0, timerEndTimestamp - now);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const minutes = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const seconds = String(remainingSeconds % 60).padStart(2, '0');

    if (countdownEl) {
        countdownEl.textContent = `${minutes}:${seconds}`;
    }

    if (remainingMs <= 0) {
        completeToddlerTimer();
        return;
    }

    timerAnimationFrame = requestAnimationFrame(updateToddlerTimerDisplay);
}

function completeToddlerTimer() {
    cancelToddlerTimer({ silent: true });
    speakTts(`${timerLabelText || 'Timer'} is done!`);
    showStatus('Timer finished!', 'success');
}

function cancelToddlerTimer({ silent = false } = {}) {
    if (timerAnimationFrame) {
        cancelAnimationFrame(timerAnimationFrame);
        timerAnimationFrame = null;
    }
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('timer-open');
    }
    const overlay = document.getElementById('timerOverlay');
    const countdownEl = document.getElementById('timerCountdown');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    if (countdownEl) {
        countdownEl.textContent = '00:00';
    }
    timerEndTimestamp = 0;
    timerDurationMs = 0;
    timerLabelText = '';
    if (!silent) {
        showStatus('Timer cancelled.', 'info');
    }
}

function startFireworksShow(durationSeconds = 6, message = 'Fireworks!') {
    const overlay = document.getElementById('fireworksOverlay');
    const labelEl = document.getElementById('fireworksLabel');

    if (!overlay || !labelEl) {
        console.warn('Fireworks overlay elements are missing.');
        return;
    }

    stopFireworksShow({ silent: true });

    const safeSeconds = Number(durationSeconds);
    const durationMs = Number.isFinite(safeSeconds) && safeSeconds > 0 ? safeSeconds * 1000 : 6000;
    const messageText = String(message || 'Fireworks!').trim() || 'Fireworks!';

    labelEl.textContent = messageText;
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('fireworks-open');
    }
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');

    // Use canvas-confetti if available
    if (typeof confetti === 'function') {
        const colors = ['#fde68a', '#fca5a5', '#a5b4fc', '#7dd3fc', '#f9a8d4', '#bbf7d0'];

        const launchConfetti = () => {
            // Launch multiple bursts from different positions
            const count = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < count; i++) {
                setTimeout(() => {
                    confetti({
                        particleCount: 50,
                        spread: 70,
                        origin: { x: Math.random() * 0.6 + 0.2, y: Math.random() * 0.5 + 0.3 },
                        colors: colors,
                        shapes: ['circle', 'square'],
                        gravity: 0.8,
                        scalar: 1.2,
                        drift: 0,
                        ticks: 200
                    });
                }, i * 100);
            }
        };

        launchConfetti();
        fireworksInterval = setInterval(launchConfetti, 600);
    } else {
        console.warn('Canvas confetti library not loaded');
    }

    fireworksTimeout = setTimeout(() => {
        stopFireworksShow({ silent: true });
    }, durationMs);

    speakTts(messageText);
    showStatus('Fireworks launched!', 'success');
}

function stopFireworksShow({ silent = false } = {}) {
    if (fireworksInterval) {
        clearInterval(fireworksInterval);
        fireworksInterval = null;
    }
    if (fireworksTimeout) {
        clearTimeout(fireworksTimeout);
        fireworksTimeout = null;
    }

    // Reset confetti if available
    if (typeof confetti === 'function' && typeof confetti.reset === 'function') {
        confetti.reset();
    }

    const overlay = document.getElementById('fireworksOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
    }
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('fireworks-open');
    }

    if (!silent) {
        showStatus('Fireworks finished.', 'info');
    }
}

function createFireworkBurst(stage, options = {}) {
    if (!stage) return;
    const colors = ['#fde68a', '#fca5a5', '#a5b4fc', '#7dd3fc', '#f9a8d4', '#bbf7d0', '#fef3c7', '#bfdbfe'];
    const particleCount = options.particleCount ?? 32;
    const rect = stage.getBoundingClientRect();
    const stageWidth = rect.width || stage.clientWidth || 1;
    const stageHeight = rect.height || stage.clientHeight || 1;
    const originX = stageWidth * (0.15 + Math.random() * 0.7);
    const originY = stageHeight * (0.25 + Math.random() * 0.5);

    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
        const distance = 140 + Math.random() * 260;
        const targetX = originX + Math.cos(angle) * distance;
        const targetY = originY + Math.sin(angle) * distance;

        const particle = document.createElement('div');
        particle.className = 'firework-particle';
        particle.style.setProperty('--x', `${(targetX / stageWidth) * 100}%`);
        particle.style.setProperty('--y', `${(targetY / stageHeight) * 100}%`);
        const color = colors[Math.floor(Math.random() * colors.length)];
        particle.style.background = color;
        particle.style.animationDuration = `${520 + Math.random() * 720}ms`;
        particle.style.boxShadow = `0 0 24px 6px ${color}`;

        stage.appendChild(particle);

        setTimeout(() => {
            particle.remove();
        }, 1100);
    }
}

// Device Registry System
// DEVICE_REGISTRY_KEY and STORAGE_KEY now defined in lights.js
// const DEVICE_REGISTRY_KEY = 'device_registry';
// const STORAGE_KEY = 'roku_ip_address';

function getDeviceRegistry() {
    try {
        const data = localStorage.getItem(DEVICE_REGISTRY_KEY);
        return data ? JSON.parse(data) : { roku: {}, govee: {} };
    } catch (error) {
        console.error('Failed to parse device registry:', error);
        return { roku: {}, govee: {} };
    }
}

function saveDeviceRegistry(registry) {
    try {
        localStorage.setItem(DEVICE_REGISTRY_KEY, JSON.stringify(registry));
    } catch (error) {
        console.error('Failed to save device registry:', error);
    }
}

function getDeviceByMac(type, mac) {
    const registry = getDeviceRegistry();
    return registry[type]?.[mac];
}

function getAllDevices() {
    const registry = getDeviceRegistry();
    return {
        govee: Object.values(registry.govee || {})
    };
}






function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function maskPin(pin) {
    if (!pin) return '';
    return '•'.repeat(pin.length);
}

function updateParentalControlsUI() {
    const input = document.getElementById('parentalPinInput');
    const statusEl = document.getElementById('parentalPinStatus');
    const localPin = getLocalParentalPin();

    if (input && input !== document.activeElement) {
        input.value = localPin || '';
    }

    if (statusEl) {
        if (localPin) {
            statusEl.textContent = `Using device-specific PIN (${maskPin(localPin)}) on this device.`;
        } else if (remotePinCode && remotePinCode !== DEFAULT_PIN_CODE) {
            statusEl.textContent = 'Using PIN from cloud config.';
        } else {
            statusEl.textContent = 'Using default PIN (1234).';
        }
    }
}

function saveParentalPinOverride() {
    const input = document.getElementById('parentalPinInput');
    if (!input) return;
    const digits = sanitizePinValue(input.value);
    if (digits.length !== 4) {
        showStatus('PIN must be exactly 4 digits.', 'error');
        return;
    }
    setLocalParentalPin(digits);
    showStatus('PIN updated for this device.', 'success');
}

function clearParentalPinOverride() {
    setLocalParentalPin('');
    const input = document.getElementById('parentalPinInput');
    if (input && input !== document.activeElement) {
        input.value = '';
    }
    showStatus('PIN reset to the cloud/default value.', 'info');
}

// Settings Lock Functions
function handleSettingsClick(event) {
    const pinModal = document.getElementById('pinModal');
    const modalOpen = pinModal && !pinModal.classList.contains('hidden');
    if (settingsUnlocked && !modalOpen) {
        event.preventDefault();
        hideSettings();
        return;
    }
    if (!settingsUnlocked && !modalOpen) {
        event.preventDefault();
        showStatus('Hold the gear button for two seconds to unlock advanced controls.', 'info');
    }
}

function startSettingsHold() {
    if (isHolding) return;
    if (settingsUnlocked) {
        hideSettings();
        return;
    }
    isHolding = true;

    const circle = document.getElementById('progressCircle');
    const lockBtn = document.getElementById('settingsLock');
    lockBtn.classList.add('scale-95', 'ring-4', 'ring-white/60');

    const startTime = Date.now();
    const interval = 50; // Update every 50ms

    holdTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        holdProgress = Math.min(elapsed / HOLD_DURATION, 1);

        // Update circle progress
        const offset = PROGRESS_CIRCUMFERENCE - (holdProgress * PROGRESS_CIRCUMFERENCE);
        circle.style.strokeDashoffset = offset;

        if (holdProgress >= 1) {
            stopSettingsHold();
            openPinModal();
        }
    }, interval);
}

function stopSettingsHold() {
    if (!isHolding) return;
    isHolding = false;

    clearInterval(holdTimer);
    holdTimer = null;
    holdProgress = 0;

    const circle = document.getElementById('progressCircle');
    const lockBtn = document.getElementById('settingsLock');
    circle.style.strokeDashoffset = PROGRESS_CIRCUMFERENCE;
    lockBtn.classList.remove('scale-95', 'ring-4', 'ring-white/60');
}

// PIN Modal Functions
function openPinModal() {
    const modal = document.getElementById('pinModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    currentPin = '';
    updatePinDisplay();
}

function closePinModal() {
    const modal = document.getElementById('pinModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    currentPin = '';
}

function enterPin(digit) {
    if (currentPin.length < 4) {
        currentPin += digit;
        updatePinDisplay();

        if (currentPin.length === 4) {
            checkPin();
        }
    }
}

function clearPin() {
    currentPin = '';
    updatePinDisplay();
}

function updatePinDisplay() {
    const display = document.getElementById('pinDisplay');
    const filled = '●'.repeat(currentPin.length);
    const empty = '○'.repeat(Math.max(0, 4 - currentPin.length));
    display.textContent = (filled + empty).padEnd(4, '○');
    display.classList.remove('text-rose-500');
    display.classList.add('text-indigo-600');
}

function checkPin() {
    if (currentPin === getActivePinCode()) {
        settingsUnlocked = true;
        closePinModal();
        showSettings();
    } else {
        // Wrong PIN - shake and clear
        const display = document.getElementById('pinDisplay');
        display.textContent = '✖ Wrong PIN';
        display.classList.remove('text-indigo-600');
        display.classList.add('text-rose-500');
        setTimeout(() => {
            clearPin();
        }, 1000);
    }
}

function renderTabConfig() {
    const container = document.getElementById('tabConfigList');
    if (!container) return;

    container.innerHTML = '';

    const tabs = getTabsForRendering();
    tabs.forEach(tab => {
        const card = document.createElement('div');
        card.className = 'rounded-2xl bg-white/10 p-4 space-y-2';

        const header = document.createElement('div');
        header.className = 'flex items-center gap-2';

        const icon = document.createElement('span');
        icon.className = 'text-2xl';
        icon.textContent = tab.icon;

        const label = document.createElement('span');
        label.className = 'font-bold text-white';
        label.textContent = tab.label;

        header.append(icon, label);

        const info = document.createElement('div');
        info.className = 'text-xs text-indigo-100 space-y-1';

        const idInfo = document.createElement('div');
        idInfo.innerHTML = `<span class="font-semibold">ID:</span> <code class="font-mono bg-white/10 px-1 py-0.5 rounded">${tab.id}</code>`;

        // Get button count from the config if available
        const tabData = tabsConfig?.tabs?.find(t => t.id === tab.id);
        const buttonCount = Array.isArray(tabData?.buttons) ? tabData.buttons.length : 0;
        const quickLaunchCount = Array.isArray(tabData?.quickLaunch) ? tabData.quickLaunch.length : 0;

        const buttonsInfo = document.createElement('div');
        buttonsInfo.className = 'text-[11px]';
        if (quickLaunchCount > 0) {
            buttonsInfo.innerHTML = `<span class="font-semibold">Content:</span> ${buttonCount} buttons, ${quickLaunchCount} quick launch items`;
        } else {
            buttonsInfo.innerHTML = `<span class="font-semibold">Content:</span> ${buttonCount} buttons`;
        }

        info.append(idInfo, buttonsInfo);
        card.append(header, info);
        container.appendChild(card);
    });
}

function showSettings() {
    // Show all advanced settings
    const advancedSections = document.querySelectorAll('[data-settings]');
    advancedSections.forEach(section => {
        section.classList.remove('hidden');
    });
    renderQuickLaunchSettings(toddlerQuickLaunchItems);
    updateToddlerContentSourceInfo();
    updateGoveeUI();
    updateParentalControlsUI();
    updateYoutubeModeUI();
    renderTabConfig();
    showStatus('Settings unlocked! Advanced controls are now visible.', 'success');

    const contentSourceSection = document.getElementById('contentSourceSection');
    if (contentSourceSection) {
        setTimeout(() => {
            contentSourceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            contentSourceSection.classList.add('showcase-highlight');
            setTimeout(() => {
                contentSourceSection.classList.remove('showcase-highlight');
            }, 1600);
        }, 50);
    }
}

function hideSettings() {
    const advancedSections = document.querySelectorAll('[data-settings]');
    advancedSections.forEach(section => {
        section.classList.add('hidden');
    });
    const contentSourceSection = document.getElementById('contentSourceSection');
    if (contentSourceSection) {
        contentSourceSection.classList.remove('showcase-highlight');
    }
    settingsUnlocked = false;
    showStatus('Advanced controls hidden. Hold the gear button to unlock again.', 'info');
}

// Toggle dark/light theme
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
}

// Initialize theme on separate listener to avoid conflicts
(function () {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    applyTheme(savedTheme);
})();

function applyTheme(theme) {
    const body = document.body;
    const darkClasses = ['from-indigo-500', 'via-indigo-600', 'to-purple-700', 'text-white'];
    const lightClasses = ['from-indigo-200', 'via-purple-100', 'to-pink-200', 'text-slate-900'];

    if (theme === 'light') {
        body.classList.remove(...darkClasses);
        body.classList.add(...lightClasses);
    } else {
        body.classList.remove(...lightClasses);
        body.classList.add(...darkClasses);
    }
}


