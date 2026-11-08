(() => {
    if (window !== window.top || window.__discrustEngineMounted) return;
    window.__discrustEngineMounted = true;

    const defaultCfg = {
        CustomAppName: 'DisCRust',
        ConfigIconStyle: 'Sliders',
        QuestHelperEnabled: true,
        QuestCompleterInstalled: true,
        QuestAutoScan: true,
        QuestAutoStart: false,
        QuestDesktopByDefault: true,
        QuestAutoCollapseFab: false,
        QuestFilterOrbs: true,
        QuestFilterFrames: true,
        QuestFilterAds: true,
        QuestFilterCodes: true,
        QuestFilterNitro: true,
        VencordServiceInstalled: true,
        VencordInstalled: true,
        VencordEnabled: true,
        KrispSpoofEnabled: true,
        DesktopNotificationsEnabled: true,
        ShowTitleBarPageTitle: true,
        ShowRamInTitleBar: true,
        ShowTitleBarButton: true,
        ReduceMotionEnabled: true,
        AutoMemoryTrim: true,
        EfficiencyMode: true,
        DiscordUiScaleStep: 0
    };
    let rawInitCfg = {};
    try { rawInitCfg = __INITIAL_CONFIG_JSON__ || {}; } catch (e) { rawInitCfg = {}; }
    let cfg = Object.assign({}, defaultCfg, (rawInitCfg && typeof rawInitCfg === 'object') ? rawInitCfg : {});
    let totalEngineRamMb = 0;
    let nativeHostRamMb = 0;

    function readWindowNameState() {
        try {
            if (typeof window.name === 'string' && window.name.startsWith('__LC_WIN_STATE__:')) {
                return JSON.parse(window.name.slice('__LC_WIN_STATE__:'.length)) || {};
            }
        } catch (e) {}
        return {};
    }

    function writeWindowNameState(patch) {
        try {
            const cur = readWindowNameState();
            const merged = Object.assign({}, cur, patch || {});
            window.name = '__LC_WIN_STATE__:' + JSON.stringify(merged);
        } catch (e) {}
    }

    try {
        const wState = readWindowNameState();
        if (typeof wState.questOnly === 'boolean') {
            cfg.QuestOnlyModeActive = wState.questOnly;
            if (wState.questOnly) cfg.QuestHelperEnabled = true;
        }
        if (wState.promptShown) {
            cfg.SessionLaunchPromptShown = true;
        }
    } catch (e) {}

    // Strip Electron/32.8.0 from JS navigator.userAgent so Discord frontend boots in pure Web mode
    // while Chromium's C++ HTTP layer sends Electron/32.8.0 on all /api/v9/quests network requests!
    try {
        const rawUa = navigator.userAgent || '';
        if (rawUa.includes('Electron/')) {
            const cleanUa = rawUa.replace(/\s*Electron\/[\d.]+/g, '');
            Object.defineProperty(Navigator.prototype, 'userAgent', {
                configurable: true,
                get: () => cleanUa
            });
        }
    } catch (e) {}

    // Minimalist Geometric DisCRust Emblem SVG (inspired by negative-space geometric monolith + curved channel + triangle accent)
    const DISCRUST_EMBLEM_SVG = `<svg width='18' height='18' viewBox='0 0 256 256' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M118 38 A90 90 0 0 0 118 218 L118 190 A62 62 0 0 1 118 66 Z' fill='currentColor'/><polygon points='72,36 92,28 100,52 78,60' fill='currentColor'/><polygon points='32,74 44,56 66,70 52,88' fill='currentColor'/><polygon points='16,118 16,138 42,138 42,118' fill='currentColor'/><polygon points='32,182 44,200 66,186 52,168' fill='currentColor'/><polygon points='72,220 92,228 100,204 78,196' fill='currentColor'/><rect x='92' y='84' width='116' height='86' rx='22' fill='currentColor'/><circle cx='128' cy='124' r='12' fill='#1e1f22'/><circle cx='172' cy='124' r='12' fill='#1e1f22'/><ellipse cx='150' cy='170' rx='22' ry='11' fill='#1e1f22'/><polygon points='194,162 218,192 184,174' fill='currentColor'/></svg>`;

    function getEffectiveAppName() {
        const n = (cfg && cfg.CustomAppName ? String(cfg.CustomAppName).trim() : '');
        if (!n || n === 'DisLite Rust' || n === 'DisLite' || n === 'Litecord') return 'DisCRust';
        return n;
    }

    function sendHost(msg) {
        try {
            if (window.ipc && typeof window.ipc.postMessage === 'function') {
                window.ipc.postMessage(String(msg));
                return;
            }
            if (window.chrome && window.chrome.webview) {
                window.chrome.webview.postMessage(String(msg));
            }
        } catch (e) {}
    }

    // ------------------------------------------------------------------------
    // 1. Desktop Google Chrome `userAgentData` Spoof for WebAssembly Krisp
    // ------------------------------------------------------------------------
    try {
        const match = navigator.userAgent.match(/Chrome\/(\d+)(\.\d+\.\d+\.\d+)?/);
        const majorVer = match ? match[1] : '131';
        const fullVer = match && match[2] ? (match[1] + match[2]) : (majorVer + '.0.0.0');

        const chromeBrands = [
            { brand: 'Google Chrome', version: majorVer },
            { brand: 'Chromium', version: majorVer },
            { brand: 'Not_A Brand', version: '24' }
        ];
        const fakeUAData = {
            brands: chromeBrands,
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: async () => ({
                architecture: 'x86',
                bitness: '64',
                brands: chromeBrands,
                fullVersionList: [
                    { brand: 'Google Chrome', version: fullVer },
                    { brand: 'Chromium', version: fullVer },
                    { brand: 'Not_A Brand', version: '24.0.0.0' }
                ],
                mobile: false,
                model: '',
                platform: 'Windows',
                platformVersion: '16.6.0',
                uaFullVersion: fullVer
            }),
            toJSON: () => ({ brands: chromeBrands, mobile: false, platform: 'Windows' })
        };

        Object.defineProperty(Navigator.prototype, 'userAgentData', {
            configurable: true,
            get: () => fakeUAData
        });
    } catch (e) {}

    // ------------------------------------------------------------------------
    // 2. WEBPACK 5 CHUNK FACTORY & FLUX STORE CAPTURE + XHR/FETCH HOOKS
    // ------------------------------------------------------------------------
    const capturedHeaders = {};
    let interceptedQuestsList = [];
    const discoveredStoresByName = new Map();
    const allLoadedModules = new Map();
    const webpackCaches = new Set();
    let cachedFluxDispatcher = null;
    let cachedRestApi = null;
    let harvestedAllStoresOnce = false;

    let earlyLocalStorage = null;
    let earlySessionStorage = null;
    const initialMirroredStorage = __INITIAL_STORAGE_MIRROR_JSON__;
    try {
        earlyLocalStorage = window.localStorage;
        earlySessionStorage = window.sessionStorage;
        if (earlySessionStorage && earlySessionStorage.getItem('__lc_quest_only_active') !== null) {
            cfg.QuestOnlyModeActive = earlySessionStorage.getItem('__lc_quest_only_active') === '1';
            if (cfg.QuestOnlyModeActive) cfg.QuestHelperEnabled = true;
        }
        // WebView2 persists localStorage natively in UserData; only restore __lc_panel_sizes if missing
        if (earlyLocalStorage && initialMirroredStorage && typeof initialMirroredStorage === 'object') {
            if (earlyLocalStorage.getItem('__lc_panel_sizes') === null && typeof initialMirroredStorage['__lc_panel_sizes'] === 'string') {
                try { earlyLocalStorage.setItem('__lc_panel_sizes', initialMirroredStorage['__lc_panel_sizes']); } catch (e) {}
            }
        }

        // Normalize MediaEngineStore in localStorage on startup so Discord Web doesn't force selfMute=true when opening the app!
        if (earlyLocalStorage) {
            const wantMute = (cfg && cfg.HasSavedVoicePrefs) ? !!cfg.SavedMicMuted : false;
            const wantDeaf = (cfg && cfg.HasSavedVoicePrefs) ? !!cfg.SavedDeafened : false;
            const rawMe = earlyLocalStorage.getItem('MediaEngineStore');
            if (rawMe) {
                try {
                    const parsedMe = JSON.parse(rawMe);
                    if (parsedMe && typeof parsedMe === 'object') {
                        const stObj = parsedMe._state || parsedMe;
                        for (const ctxKey of Object.keys(stObj)) {
                            if (stObj[ctxKey] && typeof stObj[ctxKey] === 'object' && ('selfMute' in stObj[ctxKey] || 'selfDeaf' in stObj[ctxKey])) {
                                stObj[ctxKey].selfMute = wantMute;
                                stObj[ctxKey].selfDeaf = wantDeaf;
                            }
                        }
                        if ('selfMute' in stObj) stObj.selfMute = wantMute;
                        if ('selfDeaf' in stObj) stObj.selfDeaf = wantDeaf;
                        earlyLocalStorage.setItem('MediaEngineStore', JSON.stringify(parsedMe));
                    }
                } catch (e) {}
            }
        }

        // Ensure navigator.permissions.query reports microphone & camera as granted so Discord Web never auto-mutes on launch
        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            const origPermQuery = navigator.permissions.query.bind(navigator.permissions);
            navigator.permissions.query = async function(desc) {
                if (desc && (desc.name === 'microphone' || desc.name === 'camera' || desc.name === 'notifications')) {
                    return { state: 'granted', onchange: null, addEventListener: () => {}, removeEventListener: () => {} };
                }
                return origPermQuery(desc);
            };
        }
    } catch (e) {}

    function syncLocalStorageToHostMirror() {
        try {
            if (!earlyLocalStorage) return;
            const out = {};
            const unsafeKeyPattern = /Snapshot|Cache|Gateway|Vencord|ReadState|Guild|Channel|Experiment|MediaEngineStore/i;
            for (let i = 0; i < earlyLocalStorage.length; i++) {
                const k = earlyLocalStorage.key(i);
                if (k && !unsafeKeyPattern.test(k)) {
                    out[k] = earlyLocalStorage.getItem(k);
                }
            }
            sendHost('SYNC_STORAGE_MIRROR:' + JSON.stringify(out));
        } catch (e) {}
    }

    function wrapChunkModules(moreModules) {
        if (!moreModules || typeof moreModules !== 'object') return;
        for (const modId of Object.keys(moreModules)) {
            const origFactory = moreModules[modId];
            if (typeof origFactory === 'function' && !origFactory.__lcFactoryWrapped) {
                const wrappedFactory = function(module, exports, wpRequire) {
                    try {
                        if (typeof wpRequire === 'function' && wpRequire.c && typeof wpRequire.c === 'object') {
                            webpackCaches.add(wpRequire.c);
                        }
                    } catch (e) {}
                    try {
                        return origFactory.apply(this, arguments);
                    } finally {
                        if (module && module.exports) {
                            if (!harvestedAllStoresOnce || allLoadedModules.size < 450) {
                                allLoadedModules.set(modId, module);
                            }
                            try {
                                const ex = module.exports;
                                if (ex && typeof ex === 'object') {
                                    for (const k of ['default', 'Z', 'ZP', 'A', 'Ay']) {
                                        const v = ex[k];
                                        if (v && typeof v === 'object') {
                                            if (v._dispatcher && typeof v.getName === 'function') {
                                                harvestFromStoreInstance(v);
                                            } else if (!cachedFluxDispatcher && typeof v.flushWaitQueue === 'function' && typeof v.subscribe === 'function' && typeof v.dispatch === 'function') {
                                                cachedFluxDispatcher = v;
                                            }
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                };
                wrappedFactory.__lcFactoryWrapped = true;
                try {
                    Object.defineProperty(wrappedFactory, 'length', { value: origFactory.length });
                    wrappedFactory.toString = () => origFactory.toString();
                } catch (e) {}
                moreModules[modId] = wrappedFactory;
            }
        }
    }

    function hookChunkTuple(chunk) {
        if (!Array.isArray(chunk)) return;
        if (chunk[1] && typeof chunk[1] === 'object') {
            wrapChunkModules(chunk[1]);
        }
        if (typeof chunk[2] === 'function' && !chunk[2].__lcRuntimeWrapped) {
            const origRuntime = chunk[2];
            const wrappedRuntime = function(realReq) {
                try {
                    if (typeof realReq === 'function') {
                        if (realReq.c && typeof realReq.c === 'object') webpackCaches.add(realReq.c);
                        if (realReq.m && typeof realReq.m === 'object') wrapChunkModules(realReq.m);
                    }
                } catch (e) {}
                return origRuntime.apply(this, arguments);
            };
            wrappedRuntime.__lcRuntimeWrapped = true;
            chunk[2] = wrappedRuntime;
        }
    }

    if (!cfg.VencordEnabled) {
        try {
            Object.defineProperty(Function.prototype, 'm', {
                configurable: true,
                enumerable: false,
                set(val) {
                    Object.defineProperty(this, 'm', {
                        value: val,
                        writable: true,
                        configurable: true,
                        enumerable: true
                    });
                    if (val && typeof val === 'object') {
                        wrapChunkModules(val);
                    }
                }
            });
        } catch (e) {}

        function hookChunkArray(arr) {
            if (!Array.isArray(arr) || arr.__lcArrayHooked) return;
            arr.__lcArrayHooked = true;
            for (const existing of arr) hookChunkTuple(existing);

            let currentPush = function(...chunks) {
                for (const c of chunks) hookChunkTuple(c);
                return Array.prototype.push.apply(arr, chunks);
            };
            try {
                Object.defineProperty(arr, 'push', {
                    configurable: true,
                    enumerable: false,
                    get() {
                        return currentPush;
                    },
                    set(newPush) {
                        if (typeof newPush === 'function') {
                            currentPush = function(...chunks) {
                                for (const c of chunks) hookChunkTuple(c);
                                return newPush.apply(this, chunks);
                            };
                        }
                    }
                });
            } catch (e) {}
        }

        try {
            let _lcChunkApp = window.webpackChunkdiscord_app;
            if (Array.isArray(_lcChunkApp)) hookChunkArray(_lcChunkApp);
            Object.defineProperty(window, 'webpackChunkdiscord_app', {
                configurable: true,
                enumerable: true,
                get: () => _lcChunkApp,
                set: (v) => {
                    _lcChunkApp = v;
                    if (Array.isArray(v)) hookChunkArray(v);
                }
            });
        } catch (e) {}
    }

    function buildDesktopSuperProperties(rawB64) {
        try {
            let baseObj = {};
            if (rawB64 && typeof rawB64 === 'string') {
                try {
                    baseObj = JSON.parse(atob(rawB64));
                } catch (e) {}
            }
            const desktopProps = Object.assign({}, baseObj, {
                os: 'Windows',
                browser: 'Discord Client',
                release_channel: 'stable',
                client_version: '1.0.9175',
                os_version: '10.0.22631',
                os_arch: 'x64',
                app_arch: 'x64',
                system_locale: navigator.language || 'en-US',
                browser_user_agent: navigator.userAgent + ' Electron/32.8.0',
                browser_version: '32.8.0',
                client_build_number: Math.max(Number(baseObj.client_build_number) || 0, 382940),
                native_build_number: 59498,
                client_event_source: null
            });
            return btoa(JSON.stringify(desktopProps));
        } catch (e) {
            return rawB64 || '';
        }
    }

    try {
        const origOpen = XMLHttpRequest.prototype.open;
        const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        const origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url) {
            try {
                this.__lcMethod = String(method || 'GET').toUpperCase();
                this.__lcUrl = String(url || '');
            } catch (e) {}
            return origOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            try {
                if (name && value) {
                    const lower = String(name).toLowerCase();
                    if (lower === 'authorization') {
                        capturedHeaders['Authorization'] = value;
                    } else if (lower === 'x-super-properties') {
                        capturedHeaders['X-Super-Properties-Native'] = value;
                        const desktopSp = buildDesktopSuperProperties(value);
                        capturedHeaders['X-Super-Properties'] = desktopSp;
                        // ONLY spoof Desktop X-Super-Properties on /heartbeat and /enroll (never on /claim-reward or /users/ so claiming rewards never mismatches Gateway session!)
                        if (this.__lcUrl && (this.__lcUrl.includes('/heartbeat') || this.__lcUrl.includes('/enroll'))) {
                            return origSetHeader.call(this, name, desktopSp);
                        }
                    } else if (lower === 'x-discord-locale') {
                        capturedHeaders['X-Discord-Locale'] = value;
                    } else if (lower === 'x-discord-timezone') {
                        capturedHeaders['X-Discord-Timezone'] = value;
                    }
                }
            } catch (e) {}
            return origSetHeader.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function(bodyArg) {
            try {
                if (this.__lcUrl && this.__lcUrl.includes('/quests')) {
                    this.addEventListener('load', function() {
                        try {
                            if (!this.responseType || this.responseType === 'text') {
                                const data = JSON.parse(this.responseText);
                                if (Array.isArray(data?.quests)) {
                                    interceptedQuestsList = data.quests;
                                } else if (Array.isArray(data)) {
                                    interceptedQuestsList = data;
                                }
                            }
                        } catch (e) {}
                    });
                }
            } catch (e) {}
            return origSend.apply(this, arguments);
        };
    } catch (e) {}

    function getAuthToken() {
        if (capturedHeaders['Authorization']) return capturedHeaders['Authorization'];
        try {
            if (earlyLocalStorage) {
                const raw = earlyLocalStorage.getItem('token');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (typeof parsed === 'string' && parsed.length > 10) {
                        capturedHeaders['Authorization'] = parsed;
                        return parsed;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function harvestFromStoreInstance(storeObj) {
        if (!storeObj || typeof storeObj !== 'object') return;
        try {
            if (!cachedFluxDispatcher && storeObj._dispatcher && typeof storeObj._dispatcher.dispatch === 'function' && typeof storeObj._dispatcher.subscribe === 'function') {
                cachedFluxDispatcher = storeObj._dispatcher;
            }
            const registerStoreByDuckType = (s) => {
                if (!s || typeof s !== 'object') return;
                const name = s.constructor?.displayName || s.__proto__?.constructor?.displayName || s.constructor?.persistKey || s._persistKey || (typeof s.getName === 'function' ? s.getName() : '') || '';
                if (name && name.length > 2) discoveredStoresByName.set(name, s);
                try {
                    if (typeof s.getAccounts === 'function' && (typeof s.getCanUseMultiAccount === 'function' || s.constructor?.persistKey === 'MultiAccountStore')) {
                        discoveredStoresByName.set('MultiAccountStore', s);
                    }
                    if (typeof s.getCurrentUser === 'function' && typeof s.getUser === 'function') {
                        discoveredStoresByName.set('UserStore', s);
                    }
                    if (typeof s.getGuild === 'function' && typeof s.getGuilds === 'function') {
                        discoveredStoresByName.set('GuildStore', s);
                    }
                    if (typeof s.getChannel === 'function' && typeof s.getMutablePrivateChannels === 'function') {
                        discoveredStoresByName.set('ChannelStore', s);
                    }
                    if (typeof s.getMember === 'function' && typeof s.getMembers === 'function') {
                        discoveredStoresByName.set('GuildMemberStore', s);
                    }
                    if (typeof s.getMentionCount === 'function' && typeof s.hasUnread === 'function') {
                        discoveredStoresByName.set('ReadStateStore', s);
                    }
                    if (typeof s.getPendingCount === 'function' && typeof s.isFriend === 'function') {
                        discoveredStoresByName.set('RelationshipStore', s);
                    }
                    if (typeof s.isSelfMute === 'function' && typeof s.isSelfDeaf === 'function') {
                        if (name === 'MediaEngineStore' || !discoveredStoresByName.has('MediaEngineStore')) {
                            discoveredStoresByName.set('MediaEngineStore', s);
                        }
                    }
                    if (typeof s.getVoiceStateForUser === 'function') {
                        discoveredStoresByName.set('VoiceStateStore', s);
                    }
                    if (typeof s.getQuest === 'function' && s.quests) {
                        discoveredStoresByName.set('QuestStore', s);
                    }
                } catch (e) {}
            };

            registerStoreByDuckType(storeObj);
            if (harvestedAllStoresOnce && discoveredStoresByName.has('MultiAccountStore') && discoveredStoresByName.has('UserStore')) return;

            let proto = Object.getPrototypeOf(storeObj);
            let depth = 0;
            while (proto && depth < 6) {
                if (typeof proto.constructor?.getAll === 'function') {
                    const allStores = proto.constructor.getAll();
                    if (Array.isArray(allStores) && allStores.length > 0) {
                        harvestedAllStoresOnce = true;
                        for (const s of allStores) {
                            if (!s) continue;
                            registerStoreByDuckType(s);
                            if (!cachedFluxDispatcher && s._dispatcher && typeof s._dispatcher.dispatch === 'function') {
                                cachedFluxDispatcher = s._dispatcher;
                            }
                        }
                    }
                    break;
                }
                proto = Object.getPrototypeOf(proto);
                depth++;
            }
        } catch (e) {}
    }

    function scanReactFiberForStores() {
        if (harvestedAllStoresOnce) return;
        try {
            const appMount = document.getElementById('app-mount');
            if (!appMount) return;
            const rootKey = Object.keys(appMount).find(k => k.startsWith('__reactContainer$') || k.startsWith('_reactRootContainer') || k.startsWith('__reactFiber$'));
            if (!rootKey || !appMount[rootKey]) return;

            const queue = [appMount[rootKey]];
            const visited = new Set();
            let steps = 0;
            while (queue.length > 0 && steps < 2800 && !harvestedAllStoresOnce) {
                const cur = queue.shift();
                steps++;
                if (!cur || typeof cur !== 'object' || visited.has(cur)) continue;
                visited.add(cur);

                if (cur._dispatcher && typeof cur.getName === 'function') {
                    harvestFromStoreInstance(cur);
                    if (harvestedAllStoresOnce) return;
                }

                for (const k of ['child', 'sibling', 'stateNode', 'memoizedState', 'memoizedProps', 'deps', 'next']) {
                    try {
                        if (cur[k] && typeof cur[k] === 'object') queue.push(cur[k]);
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }

    function buildDirectRestApi() {
        const activeToken = getAuthToken();
        if (!activeToken && !cachedRestApi) return null;
        const makeHeadersForUrl = (url) => {
            const tok = getAuthToken();
            const hdrs = { 'Content-Type': 'application/json' };
            if (tok) hdrs['Authorization'] = tok;
            if (capturedHeaders['X-Discord-Locale']) hdrs['X-Discord-Locale'] = capturedHeaders['X-Discord-Locale'];
            if (capturedHeaders['X-Discord-Timezone']) hdrs['X-Discord-Timezone'] = capturedHeaders['X-Discord-Timezone'];
            const needsDesktopSp = url && (url.includes('/heartbeat') || url.includes('/enroll'));
            if (needsDesktopSp) {
                hdrs['X-Super-Properties'] = buildDesktopSuperProperties(capturedHeaders['X-Super-Properties-Native'] || '');
            } else if (capturedHeaders['X-Super-Properties-Native']) {
                hdrs['X-Super-Properties'] = capturedHeaders['X-Super-Properties-Native'];
            }
            return hdrs;
        };
        const directFetchGet = async (reqObj) => {
            const url = typeof reqObj === 'string' ? reqObj : reqObj.url;
            const r = await fetch('/api/v9' + url, { method: 'GET', headers: makeHeadersForUrl(url) });
            const body = await r.json().catch(() => ({}));
            if (!r.ok) throw { status: r.status, body };
            return { status: r.status, body };
        };
        const directFetchPost = async (reqObj) => {
            const url = typeof reqObj === 'string' ? reqObj : reqObj.url;
            const reqBody = reqObj && reqObj.body !== undefined ? reqObj.body : undefined;
            const r = await fetch('/api/v9' + url, {
                method: 'POST',
                headers: makeHeadersForUrl(url),
                body: reqBody !== undefined ? JSON.stringify(reqBody) : undefined
            });
            const body = await r.json().catch(() => ({}));
            if (!r.ok) throw { status: r.status, body };
            return { status: r.status, body };
        };
        return {
            get: async (reqObj) => {
                if (cachedRestApi && typeof cachedRestApi.get === 'function') {
                    try {
                        return await cachedRestApi.get(reqObj);
                    } catch (err) {
                        if (err && typeof err.status === 'number') throw err;
                    }
                }
                return await directFetchGet(reqObj);
            },
            post: async (reqObj) => {
                if (cachedRestApi && typeof cachedRestApi.post === 'function') {
                    try {
                        return await cachedRestApi.post(reqObj);
                    } catch (err) {
                        if (err && typeof err.status === 'number') throw err;
                    }
                }
                return await directFetchPost(reqObj);
            }
        };
    }

    let lastWebpackDeepScanTs = 0;

    function getAllWebpackModulesList() {
        if (window.Vencord?.Webpack?.cache) {
            webpackCaches.add(window.Vencord.Webpack.cache);
        }
        // Only probe webpackChunkdiscord_app AFTER Discord's guild navbar has mounted so we never collide with Vencord/Discord startup chunk loading!
        if (webpackCaches.size === 0 && Array.isArray(window.webpackChunkdiscord_app) && document.querySelector('nav[class*="guilds_"]')) {
            try {
                const probeId = '__lc_wp_' + Date.now();
                window.webpackChunkdiscord_app.push([[probeId], {}, r => {
                    if (r && r.c && typeof r.c === 'object') webpackCaches.add(r.c);
                }]);
            } catch (e) {}
        }
        const mods = [];
        for (const cObj of webpackCaches) {
            if (cObj && typeof cObj === 'object') {
                for (const m of Object.values(cObj)) mods.push(m);
            }
        }
        for (const m of allLoadedModules.values()) mods.push(m);
        return mods;
    }

    function resolveDiscordModules(allowDeepScan = false) {
        if (!harvestedAllStoresOnce && document.querySelector('nav[class*="guilds_"]')) {
            scanReactFiberForStores();
        }
        let QuestsStore = discoveredStoresByName.get('QuestStore') || discoveredStoresByName.get('QuestsStore') || null;
        let RunningGameStore = discoveredStoresByName.get('RunningGameStore') || null;
        let ApplicationStreamingStore = discoveredStoresByName.get('ApplicationStreamingStore') || null;
        let ChannelStore = discoveredStoresByName.get('ChannelStore') || null;
        let GuildChannelStore = discoveredStoresByName.get('GuildChannelStore') || null;
        let FluxDispatcher = cachedFluxDispatcher;

        if (window.Vencord && window.Vencord.Webpack) {
            try {
                const wp = window.Vencord.Webpack;
                if (wp.Common) {
                    FluxDispatcher = FluxDispatcher || wp.Common.FluxDispatcher;
                    if (wp.Common.RestAPI) cachedRestApi = wp.Common.RestAPI;
                    if (!harvestedAllStoresOnce && wp.Common.Flux?.Store?.getAll) {
                        const all = wp.Common.Flux.Store.getAll();
                        if (Array.isArray(all) && all.length > 0) harvestFromStoreInstance(all[0]);
                    }
                    if (!harvestedAllStoresOnce && wp.Common.UserStore) {
                        harvestFromStoreInstance(wp.Common.UserStore);
                    }
                }
                if (wp.findStore) {
                    QuestsStore = QuestsStore || wp.findStore('QuestStore') || wp.findStore('QuestsStore');
                    RunningGameStore = RunningGameStore || wp.findStore('RunningGameStore');
                    ApplicationStreamingStore = ApplicationStreamingStore || wp.findStore('ApplicationStreamingStore');
                    ChannelStore = ChannelStore || wp.findStore('ChannelStore');
                    GuildChannelStore = GuildChannelStore || wp.findStore('GuildChannelStore');
                }
            } catch (e) {}
        }

        const nowTs = Date.now();
        if ((allowDeepScan || !QuestsStore || !FluxDispatcher) && (nowTs - lastWebpackDeepScanTs > 5000) && document.querySelector('nav[class*="guilds_"]')) {
            lastWebpackDeepScanTs = nowTs;
            const moduleList = getAllWebpackModulesList();

            for (let i = 0; i < moduleList.length; i++) {
                const m = moduleList[i];
                const exp = m && m.exports;
                if (!exp || typeof exp !== 'object') continue;

                let exportKeys = ['default', 'Z', 'ZP', 'A', 'Ay'];
                try {
                    const allK = Object.keys(exp);
                    for (const ak of allK) {
                        if (!exportKeys.includes(ak)) exportKeys.push(ak);
                    }
                } catch (e) {}

                for (let kIdx = 0; kIdx < exportKeys.length; kIdx++) {
                    const k = exportKeys[kIdx];
                    let val = null;
                    try { val = exp[k]; } catch { continue; }
                    if (!val || typeof val !== 'object') continue;

                    if (!harvestedAllStoresOnce && val._dispatcher && typeof val.getName === 'function') {
                        harvestFromStoreInstance(val);
                    }

                    let dName = '';
                    try {
                        dName = val.__proto__?.constructor?.displayName || (typeof val.getName === 'function' ? val.getName() : '');
                    } catch {}

                    if (!QuestsStore && (dName === 'QuestStore' || dName === 'QuestsStore' || (typeof val.getQuest === 'function' && val.quests))) {
                        QuestsStore = val;
                    }
                    if (!RunningGameStore && (dName === 'RunningGameStore' || (typeof val.getRunningGames === 'function' && typeof val.getGameForPID === 'function'))) {
                        RunningGameStore = val;
                    }
                    if (!ApplicationStreamingStore && (dName === 'ApplicationStreamingStore' || typeof val.getStreamerActiveStreamMetadata === 'function')) {
                        ApplicationStreamingStore = val;
                    }
                    if (!ChannelStore && (dName === 'ChannelStore' || typeof val.getSortedPrivateChannels === 'function')) {
                        ChannelStore = val;
                    }
                    if (!GuildChannelStore && (dName === 'GuildChannelStore' || typeof val.getAllGuilds === 'function')) {
                        GuildChannelStore = val;
                    }
                    if (!FluxDispatcher && typeof val.flushWaitQueue === 'function' && typeof val.subscribe === 'function' && typeof val.dispatch === 'function') {
                        FluxDispatcher = val;
                    }
                    if (!cachedRestApi && typeof val.get === 'function' && typeof val.post === 'function' && typeof val.put === 'function' && typeof val.patch === 'function' && typeof val.del === 'function' && !val._dispatcher) {
                        cachedRestApi = val;
                    }
                }
                if (harvestedAllStoresOnce && QuestsStore && RunningGameStore && FluxDispatcher) break;
            }
        }

        QuestsStore = QuestsStore || discoveredStoresByName.get('QuestStore') || discoveredStoresByName.get('QuestsStore') || null;
        RunningGameStore = RunningGameStore || discoveredStoresByName.get('RunningGameStore') || null;
        ApplicationStreamingStore = ApplicationStreamingStore || discoveredStoresByName.get('ApplicationStreamingStore') || null;
        ChannelStore = ChannelStore || discoveredStoresByName.get('ChannelStore') || null;
        GuildChannelStore = GuildChannelStore || discoveredStoresByName.get('GuildChannelStore') || null;
        FluxDispatcher = FluxDispatcher || cachedFluxDispatcher;

        if (QuestsStore) discoveredStoresByName.set('QuestStore', QuestsStore);
        if (RunningGameStore) discoveredStoresByName.set('RunningGameStore', RunningGameStore);
        if (ApplicationStreamingStore) discoveredStoresByName.set('ApplicationStreamingStore', ApplicationStreamingStore);
        if (ChannelStore) discoveredStoresByName.set('ChannelStore', ChannelStore);
        if (GuildChannelStore) discoveredStoresByName.set('GuildChannelStore', GuildChannelStore);
        if (FluxDispatcher) cachedFluxDispatcher = FluxDispatcher;

        const api = buildDirectRestApi();

        return { QuestsStore, RunningGameStore, ApplicationStreamingStore, ChannelStore, GuildChannelStore, FluxDispatcher, api };
    }

    // ------------------------------------------------------------------------
    // 3. GOOGLE MATERIAL SYMBOLS ROUNDED ICONS + ADAPTIVE DISCORD TITLEBAR
    //    & MODERN v0.2 DESIGN SYSTEM
    // ------------------------------------------------------------------------
    let discordTitleBar = null;
    let titleBarBtn = null;
    let menuOverlay = null;
    let menuOpen = false;
    let activeMenuTab = 'perf';
    let questHud = null;
    let isQuestCollapsed = false;
    let activeStartedQuestCount = 0;
    let currentQuestPercent = 0;
    let questStateStatus = 'paused';
    let savedExpandedLeft = -1;
    let savedExpandedTop = -1;

    // Authentic Google Material Symbols Rounded SVG vector geometry (viewBox='0 -960 960 960')
    // Ensures 100% Material Symbols Rounded look even when offline or under strict CSP!
    const MSR = {
        keyboard: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='2' y='5' width='20' height='14' rx='2.5'/><line x1='6' y1='9' x2='6.01' y2='9'/><line x1='10' y1='9' x2='10.01' y2='9'/><line x1='14' y1='9' x2='14.01' y2='9'/><line x1='18' y1='9' x2='18.01' y2='9'/><line x1='6' y1='13' x2='6.01' y2='13'/><line x1='18' y1='13' x2='18.01' y2='13'/><line x1='10' y1='13' x2='14' y2='13'/></svg>`,
        target: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='8.5'/><circle cx='12' cy='12' r='3'/></svg>`,
        tune: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='4' y1='8' x2='10' y2='8'/><line x1='14' y1='8' x2='20' y2='8'/><circle cx='12' cy='8' r='2.3'/><line x1='4' y1='16' x2='8' y2='16'/><line x1='12' y1='16' x2='20' y2='16'/><circle cx='10' cy='16' r='2.3'/></svg>`,
        settings: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3.2'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>`,
        bolt: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='13 2 4 14 12 14 11 22 20 10 12 10 13 2'/></svg>`,
        shield: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/></svg>`,
        palette: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='13.5' cy='6.5' r='1'/><circle cx='17.5' cy='10.5' r='1'/><circle cx='8.5' cy='7.5' r='1'/><circle cx='6.5' cy='12.5' r='1'/><path d='M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.68-.75 1.68-1.68 0-.43-.17-.83-.44-1.13-.29-.31-.44-.71-.44-1.13 0-.93.75-1.68 1.68-1.68H16c3.31 0 6-2.69 6-6 0-4.96-4.48-9-10-9z'/></svg>`,
        extension: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M19.4 12a2.4 2.4 0 0 1 0 4.8H18v2.2a2 2 0 0 1-2 2h-2.2v-1.4a2.4 2.4 0 0 0-4.8 0V21H6.8a2 2 0 0 1-2-2v-2.2H3.4a2.4 2.4 0 0 1 0-4.8h1.4V9.8a2 2 0 0 1 2-2H9V6.4a2.4 2.4 0 0 1 4.8 0v1.4H16a2 2 0 0 1 2 2V12h1.4z'/></svg>`,
        memory: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='5' y='5' width='14' height='14' rx='2'/><rect x='9' y='9' width='6' height='6' rx='1'/><path d='M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3'/></svg>`,
        eco: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.4 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z'/><path d='M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'/></svg>`,
        desktop: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='2' y='3' width='20' height='14' rx='2.5'/><line x1='8' y1='21' x2='16' y2='21'/><line x1='12' y1='17' x2='12' y2='21'/></svg>`,
        restart: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 12a9 9 0 1 1-2.64-6.36'/><polyline points='21 3 21 9 15 9'/></svg>`,
        exit: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'/><polyline points='16 17 21 12 16 7'/><line x1='21' y1='12' x2='9' y2='12'/></svg>`,
        pin: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='12' y1='17' x2='12' y2='22'/><path d='M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z'/></svg>`,
        tag: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='4' y1='9' x2='20' y2='9'/><line x1='4' y1='15' x2='20' y2='15'/><line x1='10' y1='3' x2='8' y2='21'/><line x1='16' y1='3' x2='14' y2='21'/></svg>`,
        image: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='18' height='18' rx='3'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/></svg>`,
        arrowBack: `<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='19' y1='12' x2='5' y2='12'/><polyline points='12 19 5 12 12 5'/></svg>`,
        arrowFwd: `<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='5' y1='12' x2='19' y2='12'/><polyline points='12 5 19 12 12 19'/></svg>`,
        winMin: `<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><line x1='5' y1='12' x2='19' y2='12'/></svg>`,
        winMax: `<svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linejoin='round'><rect x='4' y='4' width='16' height='16' rx='2'/></svg>`,
        winClose: `<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg>`,
        expand: `<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='7 15 12 20 17 15'/><polyline points='7 9 12 4 17 9'/></svg>`,
        play: `<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='6 4 20 12 6 20 6 4'/></svg>`,
        stop: `<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='5' y='5' width='14' height='14' rx='2'/></svg>`,
        swap: `<svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='17 1 21 5 17 9'/><path d='M3 11V9a4 4 0 0 1 4-4h14'/><polyline points='7 23 3 19 7 15'/><path d='M21 13v2a4 4 0 0 1-4 4H3'/></svg>`,
        personAdd: `<svg width='17' height='17' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='8.5' cy='7' r='4'/><line x1='20' y1='8' x2='20' y2='14'/><line x1='23' y1='11' x2='17' y2='11'/></svg>`,
        group: `<svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'/><circle cx='9' cy='7' r='4'/><path d='M23 21v-2a4 4 0 0 0-3-3.87'/><path d='M16 3.13a4 4 0 0 1 0 7.75'/></svg>`
    };

    function injectMaterialSymbolsFont() {
        if (!document.head || document.getElementById('lc-google-msr-font')) return;
        const link = document.createElement('link');
        link.id = 'lc-google-msr-font';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
        document.head.appendChild(link);
    }

    function clampElementToViewport(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(36, window.innerHeight - rect.height - 8);
        let nx = Math.min(Math.max(8, rect.left), maxLeft);
        let ny = Math.min(Math.max(36, rect.top), maxTop);
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.left = Math.round(nx) + 'px';
        el.style.top = Math.round(ny) + 'px';
    }

    function makeElementDraggable(containerEl, handleEl, onClickWithoutDrag, savePosCallback) {
        if (!containerEl || !handleEl) return;
        let dragging = false;
        let moved = false;
        let startX = 0, startY = 0;
        let origLeft = 0, origTop = 0;

        handleEl.style.cursor = 'grab';
        handleEl.style.touchAction = 'none';

        handleEl.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (cfg.QuestOnlyModeActive && containerEl && containerEl.id === 'litecord-quest-hud') return;
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            if (tag === 'button' || tag === 'input' || (e.target.closest && e.target.closest('button, input, .lc-no-drag'))) {
                return;
            }
            dragging = true;
            moved = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = containerEl.getBoundingClientRect();
            origLeft = rect.left;
            origTop = rect.top;
            containerEl.style.right = 'auto';
            containerEl.style.bottom = 'auto';
            containerEl.style.left = origLeft + 'px';
            containerEl.style.top = origTop + 'px';
            handleEl.style.cursor = 'grabbing';
            try { handleEl.setPointerCapture(e.pointerId); } catch (err) {}
            e.stopPropagation();
        });

        handleEl.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
            const rect = containerEl.getBoundingClientRect();
            const maxLeft = Math.max(6, window.innerWidth - rect.width - 6);
            const maxTop = Math.max(34, window.innerHeight - rect.height - 6);
            const nx = Math.min(Math.max(6, origLeft + dx), maxLeft);
            const ny = Math.min(Math.max(34, origTop + dy), maxTop);
            containerEl.style.left = Math.round(nx) + 'px';
            containerEl.style.top = Math.round(ny) + 'px';
        });

        const endDrag = (e) => {
            if (!dragging) return;
            dragging = false;
            handleEl.style.cursor = (cfg.QuestOnlyModeActive && containerEl && containerEl.id === 'litecord-quest-hud') ? 'default' : 'grab';
            try { handleEl.releasePointerCapture(e.pointerId); } catch (err) {}
            if (!moved && typeof onClickWithoutDrag === 'function') {
                onClickWithoutDrag();
            } else if (moved && typeof savePosCallback === 'function') {
                const r = containerEl.getBoundingClientRect();
                savePosCallback(Math.round(r.left), Math.round(r.top));
            }
        };
        handleEl.addEventListener('pointerup', endDrag);
        handleEl.addEventListener('pointercancel', endDrag);
    }

    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // 3A. GOOGLE NOTO COLOR EMOJI + RICH INTERACTIVE TOAST NOTIFICATIONS
    //     + SYSTEM DND RESPECT + TASKBAR/TRAY BADGE TELEMETRY + GAME ACTIVITY
    // ------------------------------------------------------------------------
    const APP_VERSION_STR = '0.6.6';
    const INSTALLER_VERSION_STR = '6.6.0';
    const ENGINE_VERSION_STR = '0.6.6-rust';

    let systemDndActive = false;
    let fluxNotifSubscribed = false;
    let lastNotifMessageId = '';
    let toastContainerEl = null;

    window.__lcSetSystemDndState = (isDnd) => {
        systemDndActive = !!isDnd;
    };

    function injectGoogleNotoEmojiFont() {
        if (!document.head || document.getElementById('lc-google-noto-emoji-font')) return;
        const link = document.createElement('link');
        link.id = 'lc-google-noto-emoji-font';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap';
        document.head.appendChild(link);
    }

    function isUserInDiscordDndMode() {
        try {
            const curU = getCurrentDiscordUserObject();
            if (!curU || !curU.id) return false;
            const presStore = discoveredStoresByName.get('PresenceStore')
                || discoveredStoresByName.get('SelfPresenceStore')
                || window.Vencord?.Webpack?.Common?.PresenceStore;
            if (presStore && typeof presStore.getStatus === 'function') {
                const st = presStore.getStatus(curU.id);
                if (st === 'dnd') return true;
            }
            const statusNode = document.querySelector('[class*="panel_"] [aria-label*="Do Not Disturb"]');
            if (statusNode) return true;
        } catch (e) {}
        return false;
    }

    function escapeHtmlSafe(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Converts Discord custom emoji syntax <:name:id> / <a:name:id> into inline <img> tags
    // while preserving all Unicode emojis rendered with Google Noto Color Emoji!
    function formatMessageWithGoogleAndDiscordEmojis(rawText) {
        const escaped = escapeHtmlSafe(rawText);
        return escaped.replace(/&lt;(a?):([a-zA-Z0-9_~]+):(\d{15,22})&gt;/g, (_, anim, name, id) => {
            const ext = anim === 'a' ? 'gif' : 'webp';
            const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=44&quality=lossless`;
            return `<img src="${url}" alt=":${name}:" style="width:18px;height:18px;vertical-align:-4px;margin:0 1px;object-fit:contain;display:inline-block;" />`;
        });
    }

    let hasUnviewedNotificationDot = false;
    let lastDispatchedToastSignature = '';
    let lastDispatchedToastTime = 0;
    let lastIncomingMessageMeta = null;
    const recentIncomingMessagesByAuthor = new Map();
    const notifiedMessageIdSet = new Set();
    window.__lcLastDiscordNotifClickHandler = null;

    // Force Vencord's built-in notification settings to native-only so Vencord never shows an in-app toast inside the client
    function suppressVencordInAppNotifications() {
        try {
            if (window.Vencord && window.Vencord.Settings && window.Vencord.Settings.notifications) {
                window.Vencord.Settings.notifications.useNative = 'always';
            }
            if (earlyLocalStorage) {
                const rawVc = earlyLocalStorage.getItem('VencordSettings');
                if (rawVc) {
                    const parsedVc = JSON.parse(rawVc);
                    if (parsedVc && typeof parsedVc === 'object') {
                        parsedVc.notifications = Object.assign({}, parsedVc.notifications || {}, { useNative: 'always' });
                        earlyLocalStorage.setItem('VencordSettings', JSON.stringify(parsedVc));
                    }
                }
            }
            for (const el of document.querySelectorAll('.vc-notification-root, .vc-notification, [class*="vc-notification"], #lc-toast-container')) {
                el.remove();
            }
        } catch (e) {}
    }

    window.__lcNavigateToNotificationRoute = (route) => {
        try {
            hasUnviewedNotificationDot = false;
            if (!document.hasFocus()) {
                sendHost('FOCUS_MAIN_WINDOW');
            }
            if (cfg.QuestOnlyModeActive && window.__lcSetQuestOnlyMode) {
                window.__lcSetQuestOnlyMode(false, false);
            }
            // Invoke Discord's own native notification onclick closure if available
            if (typeof window.__lcLastDiscordNotifClickHandler === 'function') {
                try {
                    const fn = window.__lcLastDiscordNotifClickHandler;
                    window.__lcLastDiscordNotifClickHandler = null;
                    fn();
                } catch (e) {}
            }
            const target = String(route || (lastIncomingMessageMeta && lastIncomingMessageMeta.route) || '/channels/@me');
            navigateDiscordToRoute(target);
            setTimeout(pollAndSyncTaskbarAndTrayState, 180);
        } catch (e) {}
    };

    const GOOGLE_EMOJI_SHORTCODE_MAP = {
        fire: '🔥', sparkles: '✨', rocket: '🚀', heart: '❤️', sob: '😭', skull: '💀',
        joy: '😂', rofl: '🤣', thumbsup: '👍', thumbsdown: '👎', wave: '👋', clap: '👏',
        pray: '🙏', eyes: '👀', tada: '🎉', party_popper: '🎉', star: '⭐', warning: '⚠️',
        white_check_mark: '✅', x: '❌', 100: '💯', thinking: '🤔', saluting_face: '🫡',
        melting_face: '🫠', nerd: '🤓', sunglasses: '😎', cry: '😢', angry: '😠', rage: '😡',
        blush: '😊', smile: '😄', grin: '😁', wink: '😉', heart_eyes: '😍', kissing_heart: '😘',
        broken_heart: '💔', two_hearts: '💕', sparkling_heart: '💖', blue_heart: '💙',
        green_heart: '💚', yellow_heart: '💛', purple_heart: '💜', ok_hand: '👌', muscle: '💪',
        crown: '👑', gem: '💎', trophy: '🏆', zap: '⚡', boom: '💥', zzz: '💤'
    };

    function convertDiscordAndShortcodeEmojisForWindowsToast(rawText) {
        let s = String(rawText || '');
        s = s.replace(/<a?:([a-zA-Z0-9_~]+):(\d{15,22})>/g, (_, name) => {
            const lower = String(name || '').toLowerCase();
            if (GOOGLE_EMOJI_SHORTCODE_MAP[lower]) return GOOGLE_EMOJI_SHORTCODE_MAP[lower];
            return `:${name}:`;
        });
        s = s.replace(/:([a-zA-Z0-9_]+):/g, (full, name) => {
            const lower = String(name || '').toLowerCase();
            return GOOGLE_EMOJI_SHORTCODE_MAP[lower] || full;
        });
        return s.trim();
    }

    function normalizeDiscordAvatarUrlToPng(rawUrl, fallbackUserId) {
        let u = String(rawUrl || '').trim();
        if (u && (u.includes('discordapp.com/') || u.includes('discordapp.net/'))) {
            const basePart = u.split('?')[0];
            if (basePart.endsWith('.webp') || basePart.endsWith('.gif')) {
                u = basePart.replace(/\.(webp|gif)$/i, '.png') + '?size=128';
            } else if (!u.includes('size=')) {
                u = basePart + '?size=128';
            }
            return u;
        }
        if (u && (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image/'))) {
            return u;
        }
        try {
            if (fallbackUserId) {
                const idx = Number((BigInt(String(fallbackUserId)) >> 22n) % 6n);
                return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
            }
        } catch (e) {}
        return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }

    function resolveBestAuthorAvatarUrl(msg, author, guildId, fallbackIconUrl) {
        try {
            const uid = author && author.id ? String(author.id) : '';
            if (uid && guildId) {
                const memberAv = (msg && msg.member && msg.member.avatar)
                    || (discoveredStoresByName.get('GuildMemberStore')?.getMember?.(guildId, uid)?.avatar);
                if (memberAv) {
                    return `https://cdn.discordapp.com/guilds/${guildId}/users/${uid}/avatars/${memberAv}.png?size=128`;
                }
            }
            if (uid) {
                const userAv = (author && author.avatar)
                    || (discoveredStoresByName.get('UserStore')?.getUser?.(uid)?.avatar);
                if (userAv) {
                    return `https://cdn.discordapp.com/avatars/${uid}/${userAv}.png?size=128`;
                }
            }
            if (fallbackIconUrl) {
                return normalizeDiscordAvatarUrlToPng(fallbackIconUrl, uid);
            }
            return normalizeDiscordAvatarUrlToPng('', uid);
        } catch (e) {
            return 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
    }

    async function fetchAvatarAsPngDataUri(avatarUrl) {
        if (!avatarUrl) return '';
        if (avatarUrl.startsWith('data:image/png;base64,')) return avatarUrl;
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 900);
            const resp = await fetch(avatarUrl, { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
            clearTimeout(timer);
            if (!resp.ok) return '';
            const blob = await resp.blob();
            const bmp = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bmp, 0, 0, 64, 64);
            if (typeof bmp.close === 'function') bmp.close();
            return canvas.toDataURL('image/png');
        } catch (e) {
            return '';
        }
    }

    // Dispatches ONLY the Native Windows Toast Notification (with circular Profile Picture, Chat/Server Name, Message & Google Emojis)
    async function showRichInteractiveToast(payload) {
        if (cfg && cfg.DesktopNotificationsEnabled === false) return;
        if (systemDndActive || isUserInDiscordDndMode()) return;

        suppressVencordInAppNotifications();

        const authorName = String(payload.title || getEffectiveAppName()).trim();
        const subtitle = String(payload.subtitle || '').trim();
        const rawBody = convertDiscordAndShortcodeEmojisForWindowsToast(payload.body || '');
        const avatarUrl = normalizeDiscordAvatarUrlToPng(payload.icon || '', payload.userId || '');
        const route = String(payload.route || (lastIncomingMessageMeta && lastIncomingMessageMeta.route) || '/channels/@me').trim();

        // Deduplicate identical or near-simultaneous toasts within 2200ms
        const sig = `${route}|${rawBody.slice(0, 64)}`;
        const now = Date.now();
        if (sig === lastDispatchedToastSignature && (now - lastDispatchedToastTime) < 2200) {
            return;
        }
        lastDispatchedToastSignature = sig;
        lastDispatchedToastTime = now;

        const iconDataUri = await fetchAvatarAsPngDataUri(avatarUrl);

        sendHost('SHOW_NOTIFICATION:' + JSON.stringify({
            title: authorName,
            subtitle: subtitle,
            body: rawBody || 'Sent an attachment',
            icon: avatarUrl,
            iconDataUri: iconDataUri,
            route: route
        }));
    }

    // Lock window.Notification so Vencord and Discord cannot spawn duplicate or in-app browser notifications
    try {
        function DisLiteNotification(title, options) {
            if (cfg && cfg.DesktopNotificationsEnabled === false) {
                return { close: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
            }
            if (systemDndActive || isUserInDiscordDndMode()) {
                return { close: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
            }
            suppressVencordInAppNotifications();
            const opts = Object.assign({}, options || {});
            let clickHandler = null;
            const notifInstance = {
                close: () => {},
                addEventListener: (ev, fn) => {
                    if (ev === 'click' && typeof fn === 'function') {
                        clickHandler = fn;
                        window.__lcLastDiscordNotifClickHandler = fn;
                    }
                },
                removeEventListener: () => {}
            };
            Object.defineProperty(notifInstance, 'onclick', {
                configurable: true,
                get: () => clickHandler,
                set: (fn) => {
                    if (typeof fn === 'function') {
                        clickHandler = fn;
                        window.__lcLastDiscordNotifClickHandler = fn;
                    }
                }
            });

            // Match against the most recent MESSAGE_CREATE metadata so server messages get exact route & PNG avatar
            const now = Date.now();
            const matchedMeta = (lastIncomingMessageMeta && (now - lastIncomingMessageMeta.time) < 4000)
                ? lastIncomingMessageMeta
                : null;

            if (matchedMeta && notifiedMessageIdSet.has(matchedMeta.id)) {
                // Already notified by MESSAGE_CREATE; just keep onclick handler captured!
                return notifInstance;
            }
            if (matchedMeta) {
                notifiedMessageIdSet.add(matchedMeta.id);
                hasUnviewedNotificationDot = true;
                showRichInteractiveToast({
                    title: matchedMeta.title,
                    subtitle: matchedMeta.subtitle,
                    body: matchedMeta.body || String(opts.body || ''),
                    icon: matchedMeta.icon || String(opts.icon || ''),
                    userId: matchedMeta.userId,
                    route: matchedMeta.route
                });
                setTimeout(pollAndSyncTaskbarAndTrayState, 80);
                return notifInstance;
            }

            // Fallback if Notification was invoked without a recent MESSAGE_CREATE match
            let cleanTitle = String(title || getEffectiveAppName()).trim();
            let subStr = '';
            const parenMatch = cleanTitle.match(/^(.*?)\s*\((#[^)]+)\)$/);
            if (parenMatch) {
                cleanTitle = parenMatch[1].trim();
                subStr = parenMatch[2].trim();
            }
            showRichInteractiveToast({
                title: cleanTitle,
                subtitle: subStr,
                body: String(opts.body || ''),
                icon: String(opts.icon || ''),
                route: (lastIncomingMessageMeta && lastIncomingMessageMeta.route) || window.location.pathname || '/channels/@me'
            });
            return notifInstance;
        }
        Object.defineProperty(DisLiteNotification, 'permission', {
            configurable: true,
            enumerable: true,
            get: () => (cfg && cfg.DesktopNotificationsEnabled === false) ? 'denied' : 'granted'
        });
        DisLiteNotification.requestPermission = async function(cb) {
            const p = (cfg && cfg.DesktopNotificationsEnabled === false) ? 'denied' : 'granted';
            if (typeof cb === 'function') {
                try { cb(p); } catch (e) {}
            }
            return p;
        };
        Object.defineProperty(window, 'Notification', {
            configurable: false,
            enumerable: true,
            get: () => DisLiteNotification,
            set: () => {}
        });
    } catch (e) {}

    let isWin32Foreground = true;
    window.__lcSetWin32Foreground = (fg) => {
        isWin32Foreground = !!fg;
    };

    let hasHydratedGamesDatabase = false;
    async function hydrateDiscordDetectableGamesDatabase() {
        if (hasHydratedGamesDatabase) return;
        if (!document.querySelector('nav[class*="guilds_"]')) return;
        scanReactFiberForStores();
        const fd = cachedFluxDispatcher || window.Vencord?.Webpack?.Common?.FluxDispatcher;
        const tok = getAuthToken();
        if (!fd || !tok) return;
        hasHydratedGamesDatabase = true;
        try {
            const hdrs = Object.assign({ 'Content-Type': 'application/json' }, capturedHeaders);
            hdrs['Authorization'] = tok;
            hdrs['X-Super-Properties'] = buildDesktopSuperProperties(capturedHeaders['X-Super-Properties'] || '');
            const r = await fetch('/api/v9/applications/detectable', { method: 'GET', headers: hdrs });
            if (r.ok) {
                const games = await r.json();
                if (Array.isArray(games) && games.length > 0) {
                    cachedDetectableGames = games;
                    try { fd.dispatch({ type: 'GAMES_DATABASE_UPDATE', games: games }); } catch (e) {}
                    try { fd.dispatch({ type: 'APPLICATIONS_FETCH_SUCCESS', applications: games }); } catch (e) {}
                }
            }
        } catch (e) {
            hasHydratedGamesDatabase = false;
        }
    }

    // Subscribe to FluxDispatcher MESSAGE_CREATE passively after Discord's UI has mounted
    function ensureFluxNotificationSubscription() {
        if (fluxNotifSubscribed) return;
        if (!document.querySelector('nav[class*="guilds_"]')) return;
        scanReactFiberForStores();
        const fd = cachedFluxDispatcher || window.Vencord?.Webpack?.Common?.FluxDispatcher;
        if (!fd || typeof fd.subscribe !== 'function') return;
        fluxNotifSubscribed = true;

        fd.subscribe('MESSAGE_CREATE', (ev) => {
            try {
                if (ev?.optimistic) return;
                const msg = ev?.message;
                if (!msg || !msg.id || msg.id === lastNotifMessageId) return;

                const curU = getCurrentDiscordUserObject();
                const author = msg.author;
                if (!author || !author.id) return;
                if (curU && String(author.id) === String(curU.id)) return;
                if (author.bot && !msg.interaction) return;

                const channelId = String(msg.channel_id || '');
                const chStore = discoveredStoresByName.get('ChannelStore') || window.Vencord?.Webpack?.Common?.ChannelStore;
                const chObj = chStore && typeof chStore.getChannel === 'function' ? chStore.getChannel(channelId) : null;
                const guildId = msg.guild_id ? String(msg.guild_id) : (chObj && chObj.guild_id ? String(chObj.guild_id) : '');
                const isPersonalChat = !guildId || (chObj && (chObj.type === 1 || chObj.type === 3));

                const senderDisp = (msg.member && msg.member.nick)
                    || author.global_name
                    || author.globalName
                    || author.username
                    || 'Discord User';

                let subtitleStr = '';
                try {
                    const gStore = discoveredStoresByName.get('GuildStore') || window.Vencord?.Webpack?.Common?.GuildStore;
                    if (guildId) {
                        const gObj = gStore && typeof gStore.getGuild === 'function' ? gStore.getGuild(guildId) : null;
                        const chName = chObj?.name ? `#${chObj.name}` : '';
                        const gName = gObj?.name || '';
                        subtitleStr = (chName && gName) ? `${chName}, ${gName}` : (chName || gName);
                    } else if (chObj && chObj.name) {
                        subtitleStr = chObj.name;
                    }
                } catch (e) {}

                const avUrl = resolveBestAuthorAvatarUrl(msg, author, guildId, '');
                const targetRoute = guildId
                    ? `/channels/${guildId}/${channelId}`
                    : `/channels/@me/${channelId}`;

                let contentText = String(msg.content || '').trim();
                if (!contentText && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
                    contentText = `📎 Sent ${msg.attachments.length} attachment(s)`;
                } else if (!contentText && Array.isArray(msg.sticker_items) && msg.sticker_items.length > 0) {
                    contentText = `🏷️ Sent a sticker`;
                }

                // Always record the latest incoming message metadata BEFORE checking mention filters,
                // so if Discord's own Notification API fires for an "All Messages" server channel, it gets the exact route and PNG avatar!
                const metaRecord = {
                    id: String(msg.id),
                    userId: String(author.id),
                    channelId: channelId,
                    guildId: guildId,
                    isPersonalChat: isPersonalChat,
                    title: senderDisp,
                    subtitle: subtitleStr,
                    body: contentText,
                    icon: avUrl,
                    route: targetRoute,
                    time: Date.now()
                };
                lastIncomingMessageMeta = metaRecord;
                recentIncomingMessagesByAuthor.set(String(author.id), metaRecord);

                if (cfg && cfg.DesktopNotificationsEnabled === false) return;
                if (systemDndActive || isUserInDiscordDndMode()) return;

                // Only skip if the native Win32 window is truly in the foreground AND user is actively viewing this exact channel
                const isViewingThisChannel = (window.location.pathname || '').includes(channelId);
                if (isWin32Foreground && document.hasFocus() && isViewingThisChannel && !document.hidden) {
                    return;
                }

                let isMentioned = false;
                if (curU && Array.isArray(msg.mentions)) {
                    isMentioned = msg.mentions.some(m => m && String(m.id) === String(curU.id));
                }
                const shouldNotifyDirectly = isPersonalChat || isMentioned || !!msg.mention_everyone;
                if (!shouldNotifyDirectly) {
                    // For unmentioned server messages, if the user has "All Messages" enabled on that server,
                    // DisLiteNotification will catch it automatically using lastIncomingMessageMeta!
                    return;
                }

                lastNotifMessageId = String(msg.id);
                notifiedMessageIdSet.add(String(msg.id));
                hasUnviewedNotificationDot = true;
                showRichInteractiveToast(metaRecord);
                setTimeout(pollAndSyncTaskbarAndTrayState, 80);
            } catch (e) {}
        });
    }

    // ------------------------------------------------------------------------
    // 3B. TASKBAR & SYSTEM TRAY STATE TELEMETRY + TRAY MUTE/DEAFEN ACTIONS
    // ------------------------------------------------------------------------
    let lastSentTaskbarStateStr = '';

    function pollAndSyncTaskbarAndTrayState() {
        try {
            const guildsNav = document.querySelector('nav[class*="guilds_"]');
            if (!guildsNav) return;
            scanReactFiberForStores();
            suppressVencordInAppNotifications();
            let dmMentions = 0;
            let serverHasActivity = false;
            let unread = false;
            let muted = false;
            let deafened = false;
            let streaming = false;
            let voiceConnected = false;

            if (document.hasFocus() && hasUnviewedNotificationDot) {
                hasUnviewedNotificationDot = false;
            }

            // 1. DM vs Server Badge separation using the Guild Separator line in nav[class*="guilds_"]
            const sepEl = guildsNav.querySelector('div[class*="guildSeparator_"]');
            const sepBottomY = sepEl ? sepEl.getBoundingClientRect().bottom : 145;
            const serversTree = guildsNav.querySelector('[aria-label="Servers"]');

            for (const badge of guildsNav.querySelectorAll('[class*="numberBadge_"]')) {
                if (badge.offsetParent !== null) {
                    const v = parseInt((badge.textContent || '').trim(), 10);
                    if (!isNaN(v) && v > 0) {
                        const bRect = badge.getBoundingClientRect();
                        const isInsideServersTree = serversTree ? serversTree.contains(badge) : false;
                        const isBelowSeparator = bRect.top >= sepBottomY;
                        if (isBelowSeparator || (isInsideServersTree && bRect.top > 130)) {
                            serverHasActivity = true;
                        } else {
                            dmMentions += v;
                        }
                    }
                }
            }

            if (dmMentions === 0) {
                const chStore = discoveredStoresByName.get('ChannelStore') || window.Vencord?.Webpack?.Common?.ChannelStore;
                const rsStore = discoveredStoresByName.get('ReadStateStore') || window.Vencord?.Webpack?.Common?.ReadStateStore;
                if (chStore && rsStore && typeof rsStore.getMentionCount === 'function' && typeof chStore.getMutablePrivateChannels === 'function') {
                    const privChannels = chStore.getMutablePrivateChannels();
                    if (privChannels && typeof privChannels === 'object') {
                        for (const ch of Object.values(privChannels)) {
                            if (ch && ch.id && !ch.guild_id && (ch.type === 1 || ch.type === 3)) {
                                const c = Number(rsStore.getMentionCount(ch.id)) || 0;
                                if (c > 0) dmMentions += c;
                            }
                        }
                    }
                }
            }

            const mentions = dmMentions;
            unread = (mentions === 0) && (hasUnviewedNotificationDot || serverHasActivity);

            // 2. Active Voice Connection check: require the live Disconnect button in the bottom-left voice panel
            const panelsEl = document.querySelector('[class*="panels_"]');
            const disconnectBtn = panelsEl ? panelsEl.querySelector('button[aria-label*="Disconnect"]') : null;
            if (disconnectBtn && disconnectBtn.offsetParent !== null) {
                voiceConnected = true;
            }

            // 3. Authoritative Mute / Deafen detection directly from the visible bottom-left panel switches
            //    (Never rely on generic duck-typed stores that falsely return true when unmuted in voice chat!)
            let rawSelfMute = false;
            let rawSelfDeaf = false;
            let foundDomVoiceBtns = false;
            if (panelsEl) {
                for (const btn of panelsEl.querySelectorAll('button')) {
                    const rawLbl = (btn.getAttribute('aria-label') || '').trim();
                    const lbl = rawLbl.toLowerCase();
                    if (!lbl || lbl.includes('stream')) continue;
                    if (lbl === 'mute' || lbl === 'unmute' || lbl.startsWith('mute (')) {
                        foundDomVoiceBtns = true;
                        const ac = btn.getAttribute('aria-checked');
                        if (ac === 'true' || lbl === 'unmute' || lbl.startsWith('unmute ')) {
                            rawSelfMute = true;
                        }
                    } else if (lbl === 'deafen' || lbl === 'undeafen' || lbl.startsWith('deafen (')) {
                        foundDomVoiceBtns = true;
                        const ac = btn.getAttribute('aria-checked');
                        if (ac === 'true' || lbl === 'undeafen' || lbl.startsWith('undeafen ')) {
                            rawSelfDeaf = true;
                        }
                    }
                }
            }

            if (!foundDomVoiceBtns && voiceConnected) {
                const voiceStateStore = discoveredStoresByName.get('VoiceStateStore');
                const curU = getCurrentDiscordUserObject();
                if (voiceStateStore && curU && typeof voiceStateStore.getVoiceStateForUser === 'function') {
                    const vs = voiceStateStore.getVoiceStateForUser(curU.id);
                    if (vs && vs.channelId) {
                        rawSelfMute = !!(vs.selfMute || vs.mute);
                        rawSelfDeaf = !!(vs.selfDeaf || vs.deaf);
                    }
                }
            }

            if (voiceConnected) {
                muted = rawSelfMute;
                deafened = rawSelfDeaf;
                const streamStore = discoveredStoresByName.get('ApplicationStreamingStore');
                if (streamStore && typeof streamStore.getCurrentUserActiveStream === 'function') {
                    streaming = streamStore.getCurrentUserActiveStream() != null;
                } else if (activeScreenShareVideoTrack && activeScreenShareVideoTrack.readyState === 'live') {
                    streaming = true;
                } else if (panelsEl && panelsEl.querySelector('button[aria-label*="Stop Streaming"]')) {
                    streaming = true;
                }
            }

            const stateStr = `${mentions},${unread ? 1 : 0},${muted ? 1 : 0},${deafened ? 1 : 0},${streaming ? 1 : 0},${voiceConnected ? 1 : 0}`;
            if (stateStr !== lastSentTaskbarStateStr) {
                lastSentTaskbarStateStr = stateStr;
                sendHost('UPDATE_TASKBAR_STATE:' + stateStr);
            }
        } catch (e) {}
    }

    window.__lcTriggerTrayMuteToggle = () => {
        try {
            const btn = document.querySelector('[class*="panels_"] button[aria-label*="Mute"], [class*="panels_"] button[aria-label*="Unmute"]');
            if (btn) btn.click();
            setTimeout(pollAndSyncTaskbarAndTrayState, 120);
        } catch (e) {}
    };

    window.__lcTriggerTrayDeafenToggle = () => {
        try {
            const btn = document.querySelector('[class*="panels_"] button[aria-label*="Deafen"], [class*="panels_"] button[aria-label*="Undeafen"]');
            if (btn) btn.click();
            setTimeout(pollAndSyncTaskbarAndTrayState, 120);
        } catch (e) {}
    };

    let activeRealDetectedGame = null;
    let restoreRealGameSpoofFn = null;

    window.__lcUpdateRunningProcesses = (processNamesList) => {
        try {
            if (!cfg.RealGameActivityEnabled || questRunnerActive) {
                if (restoreRealGameSpoofFn) {
                    restoreRealGameSpoofFn();
                    restoreRealGameSpoofFn = null;
                    activeRealDetectedGame = null;
                }
                return;
            }
            if (!Array.isArray(processNamesList) || processNamesList.length === 0) return;
            const procSet = new Set(processNamesList.map(p => String(p || '').toLowerCase()));
            const matchedGame = matchRunningProcessAgainstCatalog(procSet);
            const mods = resolveDiscordModules();
            if (matchedGame) {
                if (!activeRealDetectedGame || activeRealDetectedGame.id !== matchedGame.id) {
                    if (restoreRealGameSpoofFn) restoreRealGameSpoofFn();
                    activeRealDetectedGame = matchedGame;
                    restoreRealGameSpoofFn = patchRunningGameStoreForQuest(mods, matchedGame);
                }
            } else if (activeRealDetectedGame) {
                if (restoreRealGameSpoofFn) restoreRealGameSpoofFn();
                restoreRealGameSpoofFn = null;
                activeRealDetectedGame = null;
            }
        } catch (e) {}
    };

    // ------------------------------------------------------------------------
    // 3D. DIRECT NATIVE PREVIEW PICKER + UNIFIED DRAGGABLE "DisCRust Stream & Privacy" HUB +
    //     HIGH-BITRATE ZERO-DOWNSCALE VIDEO + REAL-TIME AUDIOWORKLET PER-APP AUDIO (DisCRust v0.6.6)
    // ------------------------------------------------------------------------
    const LC_RING_CAPACITY = 48000 * 2; // 2-second stereo ring buffer @ 48kHz
    const lcRingLeft = new Float32Array(LC_RING_CAPACITY);
    const lcRingRight = new Float32Array(LC_RING_CAPACITY);
    let lcRingWriteIdx = 0;
    let lcRingReadIdx = 0;
    let lcRingAvailable = 0;
    let lcLoopbackAudioCtx = null;
    let lcAudioWorkletReady = false;
    let lcActiveWorkletNode = null;
    let activeScreenShareVideoTrack = null;
    let activeScreenShareAudioTrack = null;
    let activeScreenShareStream = null;
    let lcUsingFallbackWasapiTrack = false;
    let userExplicitlyCheckedMuteStreamAudio = false;
    let lcActiveMediaWebSockets = new Set();
    let lcActiveGoLivePeerConnections = new Set();
    let lcStreamWatchdogInterval = null;
    let lcLastPcmChunkTime = 0;
    window.__lcActiveAudioRefs = null;

    let lcCapturableWindowsList = [];
    let lcLockedAudioTargetLabel = 'Auto';
    let lcLockedAudioTargetPid = 0;
    let lcRawPickedSurface = 'window';

    let streamSettingsState = {
        resolution: '1080',    // '720', '1080', '1440', 'source'
        fps: 60,               // 15, 30, 60
        selectedAppPid: 0,     // 0 = Auto-detect from selected window; >0 = explicit Program PID
        showPrivacyOverlay: true,
        autoDisablePrivacyAfterStream: true
    };

    let streamHubState = {
        visible: false,
        minimized: false,
        openedManuallyBetweenStreams: false,
        manualPillDetached: false,
        manualExpandedPos: false,
        left: null,
        top: null
    };

    let lcPipFollowRafId = null;
    let cachedPipDomEl = null;

    // Locate Discord's Floating Stream Preview (Picture-in-Picture) window rect if visible (with cached element fast-path!)
    function findDiscordFloatingStreamPreviewRect() {
        try {
            if (cachedPipDomEl && cachedPipDomEl.isConnected && cachedPipDomEl.offsetParent !== null) {
                const cr = cachedPipDomEl.getBoundingClientRect();
                if (cr.width >= 140 && cr.width <= 640 && cr.height >= 80 && cr.height <= 420) {
                    return cr;
                }
            }
            cachedPipDomEl = null;

            // 1. Check Discord's explicit Picture-in-Picture window containers
            const pipSelectors = [
                '[class*="pictureInPictureWindow_"]',
                '[class*="pipWindow_"]',
                '[class*="pictureInPictureVideo_"]',
                '[class*="pictureInPicture_"] [class*="root_"]'
            ];
            for (const sel of pipSelectors) {
                const nodes = document.querySelectorAll(sel);
                for (const el of nodes) {
                    if (!el || el.offsetParent === null) continue;
                    const r = el.getBoundingClientRect();
                    if (r.width >= 140 && r.width <= 640 && r.height >= 80 && r.height <= 420) {
                        cachedPipDomEl = el;
                        return r;
                    }
                }
            }

            // 2. Fallback: find any floating mini stream preview <video> card
            const videos = document.querySelectorAll('video');
            for (const v of videos) {
                const vr = v.getBoundingClientRect();
                if (vr.width >= 140 && vr.width <= 560 && vr.height >= 80 && vr.height <= 360) {
                    // Walk up up to 4 parents to find the rounded floating PiP card container
                    let card = v;
                    let cur = v.parentElement;
                    for (let d = 0; d < 5 && cur && cur !== document.body; d++) {
                        const cr = cur.getBoundingClientRect();
                        if (cr.width >= vr.width && cr.width <= vr.width + 32 && cr.height >= vr.height && cr.height <= vr.height + 48) {
                            card = cur;
                        } else if (cr.width > vr.width + 80 || cr.height > vr.height + 80) {
                            break;
                        }
                        cur = cur.parentElement;
                    }
                    const finalR = card.getBoundingClientRect();
                    // Verify it is a floating preview (not a huge stage grid tile)
                    if (finalR.width <= 580 && finalR.height <= 380 && finalR.top >= 30 && finalR.bottom <= window.innerHeight + 4) {
                        return finalR;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    function syncStreamHubPositionWithPipAndViewport() {
        const hub = document.getElementById('lc-discrust-stream-hub');
        if (!hub || !streamHubState.visible) return;

        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;
        const pipRect = findDiscordFloatingStreamPreviewRect();

        if (streamHubState.minimized) {
            const pillRect = hub.getBoundingClientRect();
            const pillW = pillRect.width || 256;
            const pillH = pillRect.height || 30;

            if (pipRect && !streamHubState.manualPillDetached) {
                // Follow Discord's Floating Stream Preview!
                let targetL = Math.round(pipRect.left + (pipRect.width - pillW) / 2);
                let targetT = Math.round(pipRect.bottom + 8);
                // If the Floating Stream Preview is too close to the bottom edge, dock the pill right above it
                if (targetT + pillH + 8 > vh) {
                    targetT = Math.round(pipRect.top - pillH - 8);
                }
                targetL = Math.max(8, Math.min(vw - pillW - 8, targetL));
                targetT = Math.max(42, Math.min(vh - pillH - 8, targetT));

                streamHubState.left = targetL;
                streamHubState.top = targetT;
                hub.style.right = 'auto';
                hub.style.bottom = 'auto';
                hub.style.left = targetL + 'px';
                hub.style.top = targetT + 'px';
            } else if (typeof streamHubState.left === 'number' && typeof streamHubState.top === 'number') {
                const clampedL = Math.max(8, Math.min(vw - pillW - 8, streamHubState.left));
                const clampedT = Math.max(42, Math.min(vh - pillH - 8, streamHubState.top));
                hub.style.right = 'auto';
                hub.style.bottom = 'auto';
                hub.style.left = clampedL + 'px';
                hub.style.top = clampedT + 'px';
            }
        } else {
            // Expanded card: open cleanly in the corner/location where the pill or PiP is WITHOUT ever going out of the window!
            const cardRect = hub.getBoundingClientRect();
            const cardW = cardRect.width || 292;
            const cardH = cardRect.height || 332;

            let targetL = (typeof streamHubState.left === 'number') ? streamHubState.left : (vw - cardW - 16);
            let targetT = (typeof streamHubState.top === 'number') ? streamHubState.top : 48;

            if (pipRect && !streamHubState.manualExpandedPos) {
                const pipCenterX = pipRect.left + pipRect.width / 2;
                const pipCenterY = pipRect.top + pipRect.height / 2;
                const isRightCorner = pipCenterX >= vw / 2;
                const isBottomCorner = pipCenterY >= vh / 2;

                // Align horizontally with the PiP in its corner
                if (isRightCorner) {
                    targetL = Math.round(pipRect.right - cardW);
                } else {
                    targetL = Math.round(pipRect.left);
                }

                // Prefer opening below PiP if top half and room exists, or above PiP if bottom half and room exists;
                // otherwise clamp cleanly inside that corner of the window!
                const spaceBelow = vh - pipRect.bottom - 12;
                const spaceAbove = pipRect.top - 46;
                if (!isBottomCorner && spaceBelow >= cardH) {
                    targetT = Math.round(pipRect.bottom + 8);
                } else if (isBottomCorner && spaceAbove >= cardH) {
                    targetT = Math.round(pipRect.top - cardH - 8);
                } else if (isBottomCorner) {
                    targetT = vh - cardH - 12;
                } else {
                    targetT = 46;
                }
            }

            const clampedL = Math.max(10, Math.min(vw - cardW - 10, targetL));
            const clampedT = Math.max(44, Math.min(vh - cardH - 10, targetT));
            streamHubState.left = clampedL;
            streamHubState.top = clampedT;
            hub.style.right = 'auto';
            hub.style.bottom = 'auto';
            hub.style.left = clampedL + 'px';
            hub.style.top = clampedT + 'px';
        }
    }

    function ensurePipFollowLoopRunning() {
        if (lcPipFollowRafId) return;
        lcPipFollowRafId = setInterval(() => {
            if (!streamHubState.visible) {
                clearInterval(lcPipFollowRafId);
                lcPipFollowRafId = null;
                return;
            }
            if (streamHubState.minimized && !streamHubState.manualPillDetached) {
                syncStreamHubPositionWithPipAndViewport();
            }
        }, 110);
    }

    function getTargetVideoBitrateBps() {
        const res = streamSettingsState.resolution;
        if (res === '720') return 6500000;
        if (res === '1080') return 11000000;
        if (res === '1440') return 16000000;
        return 20000000;
    }

    window.__lcUpdateCapturableWindows = function(list) {
        if (Array.isArray(list)) {
            lcCapturableWindowsList = list;
            const qSel = document.getElementById('lc-shub-audio-select');
            if (qSel) populateAppTargetSelect(qSel);
        }
    };

    window.__lcOnStreamAudioTargetLocked = function(labelStr, pidNum) {
        lcLockedAudioTargetLabel = String(labelStr || 'Auto');
        lcLockedAudioTargetPid = Number(pidNum) || 0;
        const badgeEl = document.getElementById('lc-shub-locked-target');
        if (badgeEl) {
            badgeEl.textContent = lcLockedAudioTargetLabel;
        }
        const pillTarget = document.getElementById('lc-shub-pill-target');
        if (pillTarget) {
            pillTarget.textContent = lcLockedAudioTargetLabel;
        }
    };

    function populateAppTargetSelect(selectEl) {
        if (!selectEl) return;
        const curVal = String(streamSettingsState.selectedAppPid || 0);
        let html = `<option value="0" ${curVal === '0' ? 'selected' : ''}>Auto (${escapeHtmlSafe(lcLockedAudioTargetLabel || 'Selected App')})</option>`;
        const seenRoots = new Set();
        for (const w of lcCapturableWindowsList) {
            const rPid = Number(w.rootPid || w.pid) || 0;
            if (!rPid || seenRoots.has(rPid)) continue;
            seenRoots.add(rPid);
            const audioPrefix = w.hasAudio ? '🔊 ' : '';
            const exeStr = escapeHtmlSafe(String(w.exe || 'App.exe'));
            const titleStr = escapeHtmlSafe(String(w.title || '').slice(0, 34));
            const isSel = String(rPid) === curVal ? 'selected' : '';
            html += `<option value="${rPid}" ${isSel}>${audioPrefix}${exeStr} — ${titleStr}</option>`;
        }
        selectEl.innerHTML = html;
    }

    function enforceHighQualityOnVideoSender(sender) {
        if (!sender || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') return;
        try {
            const params = sender.getParameters() || {};
            const wantFps = Number(streamSettingsState.fps) || 60;
            const maxBr = getTargetVideoBitrateBps();
            params.degradationPreference = 'maintain-resolution';
            if (!Array.isArray(params.encodings) || params.encodings.length === 0) {
                params.encodings = [{}];
            }
            for (const enc of params.encodings) {
                enc.active = true;
                enc.scaleResolutionDownBy = 1.0;
                enc.maxBitrate = maxBr;
                enc.minBitrate = 3000000;
                enc.maxFramerate = wantFps;
                enc.priority = 'high';
                enc.networkPriority = 'high';
            }
            sender.setParameters(params).catch(() => {});
        } catch (e) {}
    }

    function enforceHighQualityOnAudioSender(sender) {
        if (!sender || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') return;
        try {
            const params = sender.getParameters() || {};
            if (!Array.isArray(params.encodings) || params.encodings.length === 0) {
                params.encodings = [{}];
            }
            for (const enc of params.encodings) {
                enc.active = !userExplicitlyCheckedMuteStreamAudio;
                enc.maxBitrate = 160000;
                enc.priority = 'high';
                enc.networkPriority = 'high';
            }
            sender.setParameters(params).catch(() => {});
        } catch (e) {}
    }

    function applyLiveStreamQualityConstraints() {
        const res = streamSettingsState.resolution;
        const wantW = res === '720' ? 1280 : (res === '1080' ? 1920 : (res === '1440' ? 2560 : 3840));
        const wantH = res === '720' ? 720 : (res === '1080' ? 1080 : (res === '1440' ? 1440 : 2160));
        const wantFps = Number(streamSettingsState.fps) || 60;

        if (activeScreenShareVideoTrack && activeScreenShareVideoTrack.readyState === 'live') {
            try {
                if (typeof activeScreenShareVideoTrack.applyConstraints === 'function') {
                    activeScreenShareVideoTrack.applyConstraints({
                        width: { ideal: wantW, max: wantW },
                        height: { ideal: wantH, max: wantH },
                        frameRate: { ideal: wantFps, max: wantFps }
                    }).catch(() => {});
                }
            } catch (e) {}
        }

        for (const pc of lcActiveGoLivePeerConnections) {
            try {
                if (!pc || pc.connectionState === 'closed') {
                    lcActiveGoLivePeerConnections.delete(pc);
                    continue;
                }
                const senders = pc.getSenders ? pc.getSenders() : [];
                for (const s of senders) {
                    if (s && s.track && s.track.kind === 'video') {
                        enforceHighQualityOnVideoSender(s);
                    } else if (s && s.track && s.track.kind === 'audio' && pc.__lcIsScreenSharePc) {
                        enforceHighQualityOnAudioSender(s);
                    }
                }
            } catch (e) {}
        }
    }

    function turnOffAllPrivacySettingsAutomatically() {
        const anyWasOn = !!(cfg.PrivacyHideName || cfg.PrivacyHideUserId || cfg.PrivacyHideProfile);
        cfg.PrivacyHideName = false;
        cfg.PrivacyHideUserId = false;
        cfg.PrivacyHideProfile = false;
        applyPrivacyMaskingStyles();
        if (typeof syncMenuSwitches === 'function') {
            try { syncMenuSwitches(); } catch (e) {}
        }
        if (anyWasOn) {
            sendHost('DISABLE_ALL_PRIVACY_MASKS');
        }
        renderUnifiedStreamAndPrivacyHub();
    }

    // ------------------------------------------------------------------------
    // UNIFIED, CLEAN, DRAGGABLE "DisCRust Stream & Privacy" HUB (#lc-discrust-stream-hub)
    // - Minimized pill automatically follows Discord's Floating Stream Preview (PiP)
    // - Clicking the pill expands it cleanly inside the current corner without overflowing the window!
    // ------------------------------------------------------------------------
    function showUnifiedStreamAndPrivacyHub(openedManually) {
        streamHubState.visible = true;
        streamHubState.minimized = false;
        streamHubState.manualPillDetached = false;
        streamHubState.manualExpandedPos = false;
        if (openedManually) {
            streamHubState.openedManuallyBetweenStreams = true;
        }
        renderUnifiedStreamAndPrivacyHub();
        ensurePipFollowLoopRunning();
    }

    function hideUnifiedStreamAndPrivacyHub() {
        streamHubState.visible = false;
        streamHubState.openedManuallyBetweenStreams = false;
        streamHubState.manualPillDetached = false;
        streamHubState.manualExpandedPos = false;
        if (lcPipFollowRafId) {
            clearInterval(lcPipFollowRafId);
            lcPipFollowRafId = null;
        }
        const el = document.getElementById('lc-discrust-stream-hub');
        if (el) el.remove();
    }

    window.__lcToggleDisCRustPrivacyOverlayManual = function() {
        if (streamHubState.visible) {
            if (streamHubState.minimized) {
                streamHubState.minimized = false;
                streamHubState.manualExpandedPos = false;
                renderUnifiedStreamAndPrivacyHub();
            } else {
                hideUnifiedStreamAndPrivacyHub();
            }
        } else {
            showUnifiedStreamAndPrivacyHub(true);
        }
    };

    window.__lcRefreshPrivacyOverlay = function() {
        if (streamHubState.visible) {
            renderUnifiedStreamAndPrivacyHub();
        }
    };

    function renderUnifiedStreamAndPrivacyHub() {
        if (!document.body) return;
        let hub = document.getElementById('lc-discrust-stream-hub');
        if (!streamHubState.visible) {
            if (hub) hub.remove();
            return;
        }
        if (!hub) {
            hub = document.createElement('div');
            hub.id = 'lc-discrust-stream-hub';
            document.body.appendChild(hub);
        }

        const allMasksOn = !!(cfg.PrivacyHideName && cfg.PrivacyHideUserId && cfg.PrivacyHideProfile);
        const anyMaskOn = !!(cfg.PrivacyHideName || cfg.PrivacyHideUserId || cfg.PrivacyHideProfile);
        const autoOff = streamSettingsState.autoDisablePrivacyAfterStream !== false;
        const res = streamSettingsState.resolution;
        const fps = streamSettingsState.fps;
        const resLabel = res === 'source' ? 'Source' : (res + 'p');
        const isLive = !!(activeScreenShareVideoTrack && activeScreenShareVideoTrack.readyState === 'live');

        let posStyle = '';
        if (typeof streamHubState.left === 'number' && typeof streamHubState.top === 'number') {
            posStyle = `left:${streamHubState.left}px;top:${streamHubState.top}px;`;
        } else {
            posStyle = `right:16px;top:48px;`;
        }

        hub.style.cssText = `position:fixed;${posStyle}z-index:2147483647;font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;user-select:none;`;

        if (streamHubState.minimized) {
            hub.innerHTML = `
                <div id='lc-shub-pill' title='Click to expand Stream &amp; Privacy settings (follows Discord stream preview)' style='background:#18191c;border:1px solid ${anyMaskOn ? 'rgba(88,101,242,0.68)' : 'rgba(255,255,255,0.14)'};border-radius:999px;padding:6px 12px;box-shadow:0 10px 28px rgba(0,0,0,0.72);display:flex;align-items:center;gap:8px;cursor:pointer;color:#f2f3f5;'>
                    <span style='width:7px;height:7px;border-radius:50%;background:${isLive ? '#23a55a' : '#5865f2'};flex-shrink:0;'></span>
                    <span style='font-size:11px;font-weight:700;'>${resLabel} &bull; ${fps} FPS</span>
                    <span id='lc-shub-pill-target' style='font-size:10.5px;color:#57e389;max-width:105px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${escapeHtmlSafe(lcLockedAudioTargetLabel)}</span>
                    <span style='font-size:9.5px;font-weight:700;padding:1.5px 6px;border-radius:999px;background:${anyMaskOn ? 'rgba(35,165,90,0.22)' : 'rgba(255,255,255,0.08)'};color:${anyMaskOn ? '#57e389' : '#949ba4'};'>Privacy ${anyMaskOn ? 'ON' : 'OFF'}</span>
                </div>
            `;
            syncStreamHubPositionWithPipAndViewport();
            ensurePipFollowLoopRunning();

            const pillEl = hub.querySelector('#lc-shub-pill');
            if (pillEl) {
                let draggedPill = false;
                pillEl.onmousedown = (ev) => {
                    if (ev.button !== 0) return;
                    ev.preventDefault();
                    draggedPill = false;
                    const rect = hub.getBoundingClientRect();
                    const startX = ev.clientX, startY = ev.clientY;
                    const origL = rect.left, origT = rect.top;
                    const onMove = (mv) => {
                        if (Math.abs(mv.clientX - startX) > 5 || Math.abs(mv.clientY - startY) > 5) {
                            draggedPill = true;
                            streamHubState.manualPillDetached = true;
                        }
                        if (draggedPill) {
                            streamHubState.left = Math.max(6, Math.min(window.innerWidth - rect.width - 6, origL + (mv.clientX - startX)));
                            streamHubState.top = Math.max(40, Math.min(window.innerHeight - 44, origT + (mv.clientY - startY)));
                            hub.style.right = 'auto';
                            hub.style.left = streamHubState.left + 'px';
                            hub.style.top = streamHubState.top + 'px';
                        }
                    };
                    const onUp = () => {
                        window.removeEventListener('mousemove', onMove, true);
                        window.removeEventListener('mouseup', onUp, true);
                        if (!draggedPill) {
                            streamHubState.minimized = false;
                            streamHubState.manualExpandedPos = false;
                            renderUnifiedStreamAndPrivacyHub();
                        } else {
                            // If dragged near Discord's Floating Stream Preview (within 65px), re-snap to follow it!
                            const pipR = findDiscordFloatingStreamPreviewRect();
                            if (pipR && Math.abs((streamHubState.top || 0) - pipR.bottom) < 65) {
                                streamHubState.manualPillDetached = false;
                            }
                        }
                    };
                    window.addEventListener('mousemove', onMove, true);
                    window.addEventListener('mouseup', onUp, true);
                };
            }
            return;
        }

        hub.innerHTML = `
            <div style='width:292px;background:#1e1f22;border:1px solid rgba(88,101,242,0.42);border-radius:12px;box-shadow:0 18px 46px rgba(0,0,0,0.8);color:#dbdee1;overflow:hidden;'>
                <div id='lc-shub-drag-hdr' style='padding:9px 12px;background:#18191c;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;cursor:grab;' title='Drag to move anywhere on screen'>
                    <div style='display:flex;align-items:center;gap:7px;'>
                        <span style='color:#a5b4fc;display:flex;align-items:center;'>${MSR.desktop}</span>
                        <span style='font-size:12px;font-weight:700;color:#f2f3f5;'>DisCRust Stream &amp; Privacy</span>
                        ${isLive ? `<span style='font-size:9px;font-weight:800;padding:1.5px 5px;border-radius:4px;background:rgba(35,165,90,0.22);color:#57e389;'>LIVE</span>` : ''}
                    </div>
                    <div style='display:flex;align-items:center;gap:3px;'>
                        <button id='lc-shub-min' class='lc-menu-close-btn' style='width:22px;height:22px;' title='Minimize to Pill'>${MSR.winMin}</button>
                        <button id='lc-shub-close' class='lc-menu-close-btn' style='width:22px;height:22px;' title='Close'>${MSR.winClose}</button>
                    </div>
                </div>

                <div style='padding:10px 11px;display:flex;flex-direction:column;gap:9px;'>
                    <!-- Section 1: Stream Quality & Program Audio -->
                    <div style='background:#26282d;border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;gap:7px;'>
                        <div style='display:flex;justify-content:space-between;align-items:center;'>
                            <span style='font-size:11px;font-weight:600;color:#dbdee1;'>Resolution</span>
                            <div class='lc-seg-group'>
                                <button class='lc-seg-btn lc-shub-res ${res === '720' ? 'active' : ''}' data-res='720' style='padding:3px 6px;font-size:10.5px;'>720p</button>
                                <button class='lc-seg-btn lc-shub-res ${res === '1080' ? 'active' : ''}' data-res='1080' style='padding:3px 6px;font-size:10.5px;'>1080p</button>
                                <button class='lc-seg-btn lc-shub-res ${res === '1440' ? 'active' : ''}' data-res='1440' style='padding:3px 6px;font-size:10.5px;'>1440p</button>
                                <button class='lc-seg-btn lc-shub-res ${res === 'source' ? 'active' : ''}' data-res='source' style='padding:3px 6px;font-size:10.5px;'>Src</button>
                            </div>
                        </div>
                        <div style='display:flex;justify-content:space-between;align-items:center;'>
                            <span style='font-size:11px;font-weight:600;color:#dbdee1;'>Frame Rate</span>
                            <div class='lc-seg-group'>
                                <button class='lc-seg-btn lc-shub-fps ${fps === 15 ? 'active' : ''}' data-fps='15' style='padding:3px 7px;font-size:10.5px;'>15</button>
                                <button class='lc-seg-btn lc-shub-fps ${fps === 30 ? 'active' : ''}' data-fps='30' style='padding:3px 7px;font-size:10.5px;'>30</button>
                                <button class='lc-seg-btn lc-shub-fps ${fps === 60 ? 'active' : ''}' data-fps='60' style='padding:3px 7px;font-size:10.5px;'>60 FPS</button>
                            </div>
                        </div>
                        <div style='border-top:1px solid rgba(255,255,255,0.05);padding-top:6px;display:flex;flex-direction:column;gap:4px;'>
                            <div style='display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:#949ba4;'>
                                <span>Program Audio:</span>
                                <span id='lc-shub-locked-target' style='color:#57e389;font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${escapeHtmlSafe(lcLockedAudioTargetLabel)}</span>
                            </div>
                            <select id='lc-shub-audio-select' style='width:100%;height:25px;background:#141518;color:#dbdee1;border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:10.5px;padding:0 6px;outline:none;'></select>
                        </div>
                    </div>

                    <!-- Section 2: DisCRust Privacy settings -->
                    <div style='display:flex;justify-content:space-between;align-items:center;padding:0 2px;'>
                        <div style='display:flex;align-items:center;gap:5px;'>
                            <span style='color:#a5b4fc;display:flex;align-items:center;'>${MSR.shield}</span>
                            <span style='font-size:11px;font-weight:700;color:#f2f3f5;'>DisCRust Privacy settings</span>
                        </div>
                        <button id='lc-shub-all-btn' class='lc-primary-btn' style='height:20px;padding:0 8px;font-size:9.5px;'>${allMasksOn ? 'Disable All' : 'Enable All'}</button>
                    </div>

                    <div style='background:#26282d;border:1px solid rgba(255,255,255,0.05);border-radius:8px;overflow:hidden;'>
                        <div id='lc-shub-row-name' style='padding:7px 10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.045);'>
                            <span style='font-size:11px;font-weight:600;color:#f2f3f5;'>Mask Display Names</span>
                            <div class='lc-dd-switch ${cfg.PrivacyHideName ? 'active' : ''}'></div>
                        </div>
                        <div id='lc-shub-row-userid' style='padding:7px 10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.045);'>
                            <span style='font-size:11px;font-weight:600;color:#f2f3f5;'>Mask UserIDs &amp; Tags</span>
                            <div class='lc-dd-switch ${cfg.PrivacyHideUserId ? 'active' : ''}'></div>
                        </div>
                        <div id='lc-shub-row-profile' style='padding:7px 10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.045);'>
                            <span style='font-size:11px;font-weight:600;color:#f2f3f5;'>Mask Profile Avatars</span>
                            <div class='lc-dd-switch ${cfg.PrivacyHideProfile ? 'active' : ''}'></div>
                        </div>
                        <div id='lc-shub-row-autooff' style='padding:6.5px 10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:rgba(0,0,0,0.16);'>
                            <span style='font-size:10.5px;font-weight:600;color:#a5b4fc;'>Auto-Off After Stream</span>
                            <div class='lc-dd-switch ${autoOff ? 'active' : ''}'></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Immediately position the expanded card in the current corner without overflowing the window!
        syncStreamHubPositionWithPipAndViewport();

        const qSel = hub.querySelector('#lc-shub-audio-select');
        if (qSel) {
            populateAppTargetSelect(qSel);
            qSel.onchange = () => {
                const chosenPid = parseInt(qSel.value || '0', 10) || 0;
                streamSettingsState.selectedAppPid = chosenPid;
                if (activeScreenShareVideoTrack && activeScreenShareVideoTrack.readyState === 'live') {
                    sendHost('START_AUDIO_LOOPBACK:' + JSON.stringify({
                        surface: lcRawPickedSurface || 'window',
                        deviceId: '',
                        label: '',
                        width: 0,
                        height: 0,
                        explicitPid: chosenPid
                    }));
                }
            };
        }

        const dragHdr = hub.querySelector('#lc-shub-drag-hdr');
        if (dragHdr) {
            dragHdr.onmousedown = (ev) => {
                if (ev.button !== 0 || (ev.target && ev.target.closest('button'))) return;
                ev.preventDefault();
                streamHubState.manualExpandedPos = true;
                const rect = hub.getBoundingClientRect();
                const cardW = rect.width || 292;
                const cardH = rect.height || 332;
                const startX = ev.clientX, startY = ev.clientY;
                const origL = rect.left, origT = rect.top;
                const onMove = (mv) => {
                    streamHubState.left = Math.max(8, Math.min(window.innerWidth - cardW - 8, origL + (mv.clientX - startX)));
                    streamHubState.top = Math.max(42, Math.min(window.innerHeight - cardH - 8, origT + (mv.clientY - startY)));
                    hub.style.right = 'auto';
                    hub.style.left = streamHubState.left + 'px';
                    hub.style.top = streamHubState.top + 'px';
                };
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove, true);
                    window.removeEventListener('mouseup', onUp, true);
                };
                window.addEventListener('mousemove', onMove, true);
                window.addEventListener('mouseup', onUp, true);
            };
        }

        hub.querySelector('#lc-shub-min').onclick = () => {
            streamHubState.minimized = true;
            streamHubState.manualPillDetached = false;
            renderUnifiedStreamAndPrivacyHub();
        };
        hub.querySelector('#lc-shub-close').onclick = () => {
            hideUnifiedStreamAndPrivacyHub();
        };

        for (const b of hub.querySelectorAll('.lc-shub-res')) {
            b.onclick = () => {
                streamSettingsState.resolution = b.getAttribute('data-res') || '1080';
                applyLiveStreamQualityConstraints();
                renderUnifiedStreamAndPrivacyHub();
            };
        }
        for (const b of hub.querySelectorAll('.lc-shub-fps')) {
            b.onclick = () => {
                streamSettingsState.fps = parseInt(b.getAttribute('data-fps') || '60', 10) || 60;
                applyLiveStreamQualityConstraints();
                renderUnifiedStreamAndPrivacyHub();
            };
        }

        hub.querySelector('#lc-shub-all-btn').onclick = (e) => {
            e.stopPropagation();
            const targetState = !allMasksOn;
            cfg.PrivacyHideName = targetState;
            cfg.PrivacyHideUserId = targetState;
            cfg.PrivacyHideProfile = targetState;
            applyPrivacyMaskingStyles();
            if (typeof syncMenuSwitches === 'function') {
                try { syncMenuSwitches(); } catch (err) {}
            }
            sendHost(targetState ? 'ENABLE_ALL_PRIVACY_MASKS' : 'DISABLE_ALL_PRIVACY_MASKS');
            renderUnifiedStreamAndPrivacyHub();
        };

        hub.querySelector('#lc-shub-row-name').onclick = () => {
            cfg.PrivacyHideName = !cfg.PrivacyHideName;
            applyPrivacyMaskingStyles();
            if (typeof syncMenuSwitches === 'function') {
                try { syncMenuSwitches(); } catch (err) {}
            }
            sendHost('TOGGLE_PRIVACY_NAME');
            renderUnifiedStreamAndPrivacyHub();
        };

        hub.querySelector('#lc-shub-row-userid').onclick = () => {
            cfg.PrivacyHideUserId = !cfg.PrivacyHideUserId;
            applyPrivacyMaskingStyles();
            if (typeof syncMenuSwitches === 'function') {
                try { syncMenuSwitches(); } catch (err) {}
            }
            sendHost('TOGGLE_PRIVACY_USERID');
            renderUnifiedStreamAndPrivacyHub();
        };

        hub.querySelector('#lc-shub-row-profile').onclick = () => {
            cfg.PrivacyHideProfile = !cfg.PrivacyHideProfile;
            applyPrivacyMaskingStyles();
            if (typeof syncMenuSwitches === 'function') {
                try { syncMenuSwitches(); } catch (err) {}
            }
            sendHost('TOGGLE_PRIVACY_PROFILE');
            renderUnifiedStreamAndPrivacyHub();
        };

        hub.querySelector('#lc-shub-row-autooff').onclick = () => {
            streamSettingsState.autoDisablePrivacyAfterStream = !streamSettingsState.autoDisablePrivacyAfterStream;
            renderUnifiedStreamAndPrivacyHub();
        };
    }

    function ensureVencordStreamQualityEnabled() {
        try {
            if (window.Vencord && window.Vencord.Settings && window.Vencord.Settings.plugins) {
                const plugins = window.Vencord.Settings.plugins;
                if (plugins.FakeNitro) {
                    if (plugins.FakeNitro.enabled === undefined) plugins.FakeNitro.enabled = true;
                    if (plugins.FakeNitro.enableStreamQuality === undefined) plugins.FakeNitro.enableStreamQuality = true;
                }
                if (plugins.WebScreenShareFixes) {
                    plugins.WebScreenShareFixes.enabled = true;
                }
            }
        } catch (e) {}
    }
    setInterval(ensureVencordStreamQualityEnabled, 2500);

    function checkDiscordMuteStreamAudioDomState() {
        try {
            const allLabels = document.querySelectorAll('label, div, h3, h4, span');
            for (const el of allLabels) {
                if (el.childElementCount === 0 && el.textContent && el.textContent.trim() === 'Mute Stream Audio') {
                    let row = el.parentElement;
                    for (let depth = 0; depth < 4 && row; depth++) {
                        const chk = row.querySelector('input[type="checkbox"], [role="checkbox"], [role="switch"]');
                        if (chk) {
                            if (typeof chk.checked === 'boolean') return chk.checked;
                            if (chk.getAttribute('aria-checked') === 'true') return true;
                            if (chk.getAttribute('aria-checked') === 'false') return false;
                        }
                        row = row.parentElement;
                    }
                }
            }
        } catch (e) {}
        return false;
    }

    document.addEventListener('click', () => {
        setTimeout(() => {
            userExplicitlyCheckedMuteStreamAudio = checkDiscordMuteStreamAudioDomState();
            if (activeScreenShareAudioTrack) {
                try {
                    activeScreenShareAudioTrack.enabled = !userExplicitlyCheckedMuteStreamAudio;
                } catch (e) {}
            }
        }, 30);
    }, true);

    window.__lcOnNativeAudioPcmChunk = function(b64) {
        if (!lcUsingFallbackWasapiTrack || !b64 || typeof b64 !== 'string') return;
        try {
            if (lcLoopbackAudioCtx && lcLoopbackAudioCtx.state === 'suspended') {
                lcLoopbackAudioCtx.resume().catch(() => {});
            }
            const bin = window.atob(b64);
            const byteLen = bin.length;
            const totalStereoFrames = Math.floor(byteLen / 4);
            if (totalStereoFrames <= 0) return;

            let peak = 0.0;
            const hasWorklet = !!(lcActiveWorkletNode && lcActiveWorkletNode.port);
            const wlLeft = hasWorklet ? new Float32Array(totalStereoFrames) : null;
            const wlRight = hasWorklet ? new Float32Array(totalStereoFrames) : null;

            for (let i = 0; i < totalStereoFrames; i++) {
                const offset = i * 4;
                let sL = (bin.charCodeAt(offset) & 0xff) | ((bin.charCodeAt(offset + 1) & 0xff) << 8);
                if (sL >= 0x8000) sL -= 0x10000;
                let sR = (bin.charCodeAt(offset + 2) & 0xff) | ((bin.charCodeAt(offset + 3) & 0xff) << 8);
                if (sR >= 0x8000) sR -= 0x10000;

                const fL = sL / 32768.0;
                const fR = sR / 32768.0;

                if (hasWorklet) {
                    wlLeft[i] = fL;
                    wlRight[i] = fR;
                } else {
                    lcRingLeft[lcRingWriteIdx] = fL;
                    lcRingRight[lcRingWriteIdx] = fR;
                    lcRingWriteIdx = (lcRingWriteIdx + 1) % LC_RING_CAPACITY;
                    if (lcRingAvailable < LC_RING_CAPACITY) {
                        lcRingAvailable++;
                    } else {
                        lcRingReadIdx = (lcRingReadIdx + 1) % LC_RING_CAPACITY;
                    }
                }
                const a = Math.abs(fL) > Math.abs(fR) ? Math.abs(fL) : Math.abs(fR);
                if (a > peak) peak = a;
            }

            if (hasWorklet) {
                try {
                    lcActiveWorkletNode.port.postMessage(
                        { l: wlLeft, r: wlRight, muted: !!userExplicitlyCheckedMuteStreamAudio },
                        [wlLeft.buffer, wlRight.buffer]
                    );
                } catch (e) {}
            }

            if (peak > 0.001 && Date.now() - lcLastPcmChunkTime > 500) {
                lcLastPcmChunkTime = Date.now();
                for (const ws of lcActiveMediaWebSockets) {
                    try {
                        if (ws.readyState === 1 && ws.__lcIsStreamWs && ws.__lcBaseSsrc) {
                            ws.__lcOrigSend(JSON.stringify({
                                op: 5,
                                d: { speaking: 2, delay: 0, ssrc: ws.__lcBaseSsrc }
                            }));
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
    };

    try {
        const OrigWebSocket = window.WebSocket;
        if (typeof OrigWebSocket === 'function' && !OrigWebSocket.__lcMediaHooked) {
            const PatchedWebSocket = function(url, protocols) {
                const ws = protocols !== undefined ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url);
                try {
                    const urlStr = String(url || '');
                    if (urlStr.includes('discord.media') || urlStr.includes('.media.')) {
                        lcActiveMediaWebSockets.add(ws);
                        ws.addEventListener('close', () => lcActiveMediaWebSockets.delete(ws));
                        ws.addEventListener('message', (ev) => {
                            try {
                                if (typeof ev.data === 'string' && ev.data.startsWith('{')) {
                                    const msg = JSON.parse(ev.data);
                                    if (msg && msg.op === 2 && msg.d && typeof msg.d.ssrc === 'number') {
                                        ws.__lcBaseSsrc = msg.d.ssrc;
                                        if (Array.isArray(msg.d.streams) && msg.d.streams.length > 0 && activeScreenShareStream) {
                                            ws.__lcIsStreamWs = true;
                                        }
                                    }
                                }
                            } catch (e) {}
                        });

                        const origSend = ws.send.bind(ws);
                        ws.__lcOrigSend = origSend;
                        ws.send = function(data) {
                            try {
                                if (typeof data === 'string' && data.startsWith('{') && activeScreenShareStream && !userExplicitlyCheckedMuteStreamAudio) {
                                    const pkt = JSON.parse(data);
                                    if (pkt && pkt.op === 12 && pkt.d) {
                                        if (pkt.d.video_ssrc && pkt.d.video_ssrc > 0) {
                                            ws.__lcIsStreamWs = true;
                                            if (!pkt.d.audio_ssrc || pkt.d.audio_ssrc === 0) {
                                                pkt.d.audio_ssrc = ws.__lcBaseSsrc || (pkt.d.video_ssrc - 1);
                                            }
                                            ws.__lcBaseSsrc = pkt.d.audio_ssrc;
                                            data = JSON.stringify(pkt);
                                            setTimeout(() => {
                                                try {
                                                    if (ws.readyState === 1) {
                                                        origSend(JSON.stringify({
                                                            op: 5,
                                                            d: { speaking: 2, delay: 0, ssrc: pkt.d.audio_ssrc }
                                                        }));
                                                    }
                                                } catch (e) {}
                                            }, 40);
                                        }
                                    } else if (pkt && pkt.op === 5 && pkt.d && ws.__lcIsStreamWs) {
                                        pkt.d.speaking = 2;
                                        if (!pkt.d.ssrc && ws.__lcBaseSsrc) pkt.d.ssrc = ws.__lcBaseSsrc;
                                        data = JSON.stringify(pkt);
                                    }
                                }
                            } catch (e) {}
                            return origSend(data);
                        };
                    }
                } catch (e) {}
                return ws;
            };
            PatchedWebSocket.prototype = OrigWebSocket.prototype;
            PatchedWebSocket.CONNECTING = OrigWebSocket.CONNECTING;
            PatchedWebSocket.OPEN = OrigWebSocket.OPEN;
            PatchedWebSocket.CLOSING = OrigWebSocket.CLOSING;
            PatchedWebSocket.CLOSED = OrigWebSocket.CLOSED;
            PatchedWebSocket.__lcMediaHooked = true;
            window.WebSocket = PatchedWebSocket;
        }
    } catch (e) {}

    async function ensureLoopbackAudioWorkletLoaded(ctx) {
        if (!ctx || !ctx.audioWorklet || lcAudioWorkletReady) return lcAudioWorkletReady;
        try {
            const workletCode = `
                class DisCRustLoopbackWorklet extends AudioWorkletProcessor {
                    constructor() {
                        super();
                        this.cap = 48000 * 2;
                        this.ringL = new Float32Array(this.cap);
                        this.ringR = new Float32Array(this.cap);
                        this.wIdx = 0;
                        this.rIdx = 0;
                        this.avail = 0;
                        this.muted = false;
                        this.port.onmessage = (ev) => {
                            const d = ev.data;
                            if (!d) return;
                            if (typeof d.muted === 'boolean') this.muted = d.muted;
                            const l = d.l, r = d.r;
                            if (l && r && l.length > 0) {
                                const n = l.length;
                                for (let i = 0; i < n; i++) {
                                    this.ringL[this.wIdx] = l[i];
                                    this.ringR[this.wIdx] = r[i];
                                    this.wIdx = (this.wIdx + 1) % this.cap;
                                    if (this.avail < this.cap) {
                                        this.avail++;
                                    } else {
                                        this.rIdx = (this.rIdx + 1) % this.cap;
                                    }
                                }
                                if (this.avail > 14400) {
                                    const drop = this.avail - 7200;
                                    this.rIdx = (this.rIdx + drop) % this.cap;
                                    this.avail = 7200;
                                }
                            }
                        };
                    }
                    process(inputs, outputs) {
                        const out = outputs[0];
                        if (!out || out.length === 0) return true;
                        const outL = out[0];
                        const outR = out.length > 1 ? out[1] : outL;
                        const len = outL.length;
                        if (this.muted) {
                            for (let i = 0; i < len; i++) {
                                outL[i] = 0.0;
                                outR[i] = 0.0;
                            }
                            return true;
                        }
                        for (let i = 0; i < len; i++) {
                            if (this.avail > 0) {
                                outL[i] = this.ringL[this.rIdx];
                                outR[i] = this.ringR[this.rIdx];
                                this.rIdx = (this.rIdx + 1) % this.cap;
                                this.avail--;
                            } else {
                                outL[i] = 0.0;
                                outR[i] = 0.0;
                            }
                        }
                        return true;
                    }
                }
                registerProcessor('discrust-loopback-worklet', DisCRustLoopbackWorklet);
            `;
            const blob = new Blob([workletCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            await ctx.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            lcAudioWorkletReady = true;
            return true;
        } catch (e) {
            return false;
        }
    }

    async function createProcessLoopbackRingBufferAudioTrack(rawStream, isMonitorSurface) {
        try {
            const AudioCtxCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtxCtor) return null;
            if (!lcLoopbackAudioCtx || lcLoopbackAudioCtx.state === 'closed') {
                lcLoopbackAudioCtx = new AudioCtxCtor({ sampleRate: 48000, latencyHint: 'interactive' });
                lcAudioWorkletReady = false;
            }
            if (lcLoopbackAudioCtx.state === 'suspended') {
                await lcLoopbackAudioCtx.resume().catch(() => {});
            }

            lcRingWriteIdx = 0;
            lcRingReadIdx = 0;
            lcRingAvailable = 0;
            lcActiveWorkletNode = null;

            const destNode = lcLoopbackAudioCtx.createMediaStreamDestination();
            destNode.channelCount = 2;

            const keepAliveOsc = lcLoopbackAudioCtx.createOscillator();
            const keepAliveInGain = lcLoopbackAudioCtx.createGain();
            keepAliveOsc.frequency.value = 20;
            keepAliveInGain.gain.value = 0.000001;
            keepAliveOsc.connect(keepAliveInGain);
            keepAliveOsc.start();

            const keepAliveOutGain = lcLoopbackAudioCtx.createGain();
            keepAliveOutGain.gain.value = 0.0;
            keepAliveOutGain.connect(lcLoopbackAudioCtx.destination);

            // 1. Prefer dedicated real-time AudioWorkletNode (runs on C++ audio thread, zero main-thread stutter or background cutoff!)
            const workletLoaded = await ensureLoopbackAudioWorkletLoaded(lcLoopbackAudioCtx);
            let procNode = null;
            if (workletLoaded && typeof window.AudioWorkletNode === 'function') {
                try {
                    const wlNode = new window.AudioWorkletNode(lcLoopbackAudioCtx, 'discrust-loopback-worklet', {
                        numberOfInputs: 1,
                        numberOfOutputs: 1,
                        outputChannelCount: [2]
                    });
                    keepAliveInGain.connect(wlNode);
                    wlNode.connect(destNode);
                    wlNode.connect(keepAliveOutGain);
                    lcActiveWorkletNode = wlNode;
                    procNode = wlNode;
                } catch (e) {}
            }

            // 2. Fallback to ScriptProcessorNode if AudioWorklet was blocked by CSP
            if (!procNode) {
                procNode = lcLoopbackAudioCtx.createScriptProcessor(2048, 2, 2);
                keepAliveInGain.connect(procNode);
                procNode.connect(destNode);
                procNode.connect(keepAliveOutGain);

                procNode.onaudioprocess = function(ev) {
                    const outL = ev.outputBuffer.getChannelData(0);
                    const outR = ev.outputBuffer.numberOfChannels > 1 ? ev.outputBuffer.getChannelData(1) : outL;
                    const len = outL.length;

                    if (userExplicitlyCheckedMuteStreamAudio) {
                        for (let i = 0; i < len; i++) {
                            outL[i] = 0.0;
                            outR[i] = 0.0;
                        }
                        return;
                    }

                    if (lcRingAvailable > 14400) {
                        const drop = lcRingAvailable - 7200;
                        lcRingReadIdx = (lcRingReadIdx + drop) % LC_RING_CAPACITY;
                        lcRingAvailable = 7200;
                    }

                    for (let i = 0; i < len; i++) {
                        if (lcRingAvailable > 0) {
                            outL[i] = lcRingLeft[lcRingReadIdx];
                            outR[i] = lcRingRight[lcRingReadIdx];
                            lcRingReadIdx = (lcRingReadIdx + 1) % LC_RING_CAPACITY;
                            lcRingAvailable--;
                        } else {
                            outL[i] = 0.0;
                            outR[i] = 0.0;
                        }
                    }
                };
            }

            window.__lcActiveAudioRefs = {
                procNode,
                destNode,
                keepAliveOsc,
                keepAliveInGain,
                keepAliveOutGain
            };
            lcUsingFallbackWasapiTrack = true;
            return destNode.stream.getAudioTracks()[0] || null;
        } catch (e) {
            return null;
        }
    }

    function stopAndCleanupScreenShareAudio() {
        lcUsingFallbackWasapiTrack = false;
        lcActiveWorkletNode = null;
        sendHost('STOP_AUDIO_LOOPBACK');
        if (lcStreamWatchdogInterval) {
            clearInterval(lcStreamWatchdogInterval);
            lcStreamWatchdogInterval = null;
        }
        if (window.__lcActiveAudioRefs) {
            try { window.__lcActiveAudioRefs.keepAliveOsc.stop(); } catch (e) {}
            try { window.__lcActiveAudioRefs.keepAliveInGain.disconnect(); } catch (e) {}
            try { window.__lcActiveAudioRefs.procNode.disconnect(); } catch (e) {}
            try { window.__lcActiveAudioRefs.keepAliveOutGain.disconnect(); } catch (e) {}
            window.__lcActiveAudioRefs = null;
        }
    }

    function decorateScreenShareVideoAndAudioTracks(stream) {
        if (!stream) return;
        const vTrack = stream.getVideoTracks()[0] || null;
        if (vTrack) {
            // Do NOT set contentHint = 'motion' (which causes WebRTC to aggressively quantize/pixelate sharp game & desktop details!)
            try { vTrack.contentHint = ''; } catch (e) {}
            if (typeof vTrack.getSettings === 'function' && !vTrack.__lcPatchedSettings) {
                vTrack.__lcPatchedSettings = true;
                const origGetSettings = vTrack.getSettings.bind(vTrack);
                vTrack.getSettings = function() {
                    const s = Object.assign({}, origGetSettings() || {});
                    s.displaySurface = 'monitor';
                    s.logicalSurface = true;
                    return s;
                };
            }
        }
        for (const aTrack of stream.getAudioTracks()) {
            if (aTrack && !aTrack.__lcPatchedAudio) {
                aTrack.__lcPatchedAudio = true;
                try {
                    aTrack.enabled = !userExplicitlyCheckedMuteStreamAudio;
                    Object.defineProperty(aTrack, 'label', {
                        value: 'DisCRust Per-Application Audio (Stereo)',
                        configurable: true
                    });
                } catch (e) {}
                aTrack.getSettings = function() {
                    return {
                        deviceId: 'default',
                        groupId: 'default',
                        autoGainControl: false,
                        channelCount: 2,
                        echoCancellation: false,
                        latency: 0.01,
                        noiseSuppression: false,
                        sampleRate: 48000,
                        sampleSize: 16,
                        systemAudio: 'include',
                        windowAudio: 'system'
                    };
                };
            }
        }
    }

    let lcHookedFluxDispatchFn = false;
    function ensureGoLiveFluxAudioUnmutedHook() {
        if (lcHookedFluxDispatchFn) return;
        const fd = cachedFluxDispatcher || window.Vencord?.Webpack?.Common?.FluxDispatcher;
        if (!fd || typeof fd.dispatch !== 'function' || fd.__lcGoLiveHooked) return;
        fd.__lcGoLiveHooked = true;
        lcHookedFluxDispatchFn = true;
        const origDispatch = fd.dispatch.bind(fd);
        fd.dispatch = function(action) {
            try {
                if (action && typeof action.type === 'string' && !userExplicitlyCheckedMuteStreamAudio) {
                    if (
                        action.type === 'MEDIA_ENGINE_SET_GO_LIVE_SOURCE'
                        || action.type === 'STREAM_START'
                        || action.type === 'STREAM_UPDATE'
                        || action.type === 'OVERLAY_SET_GO_LIVE_SOURCE'
                    ) {
                        if ('sound' in action) action.sound = true;
                        if ('audio' in action) action.audio = true;
                        if ('muteStreamAudio' in action) action.muteStreamAudio = false;
                        if (action.settings && typeof action.settings === 'object') {
                            action.settings.sound = true;
                            if ('audio' in action.settings) action.settings.audio = true;
                            if ('muteStreamAudio' in action.settings) action.settings.muteStreamAudio = false;
                            if (action.settings.desktopSettings && typeof action.settings.desktopSettings === 'object') {
                                action.settings.desktopSettings.sound = true;
                            }
                            if (action.settings.qualityOptions && typeof action.settings.qualityOptions === 'object') {
                                action.settings.qualityOptions.sound = true;
                            }
                        }
                    }
                }
            } catch (e) {}
            return origDispatch(action);
        };
    }
    setInterval(ensureGoLiveFluxAudioUnmutedHook, 1500);

    // Hook RTCRtpSender.prototype.setParameters so Discord can NEVER downscale resolution or cap bitrate low!
    try {
        if (typeof window.RTCRtpSender === 'function' && window.RTCRtpSender.prototype && !window.RTCRtpSender.prototype.__lcHookedSetParams) {
            const origSetParams = window.RTCRtpSender.prototype.setParameters;
            if (typeof origSetParams === 'function') {
                window.RTCRtpSender.prototype.setParameters = function(params) {
                    try {
                        if (this.track && (this.track === activeScreenShareVideoTrack || (activeScreenShareVideoTrack && this.track.kind === 'video'))) {
                            params = Object.assign({}, params || {});
                            params.degradationPreference = 'maintain-resolution';
                            const maxBr = getTargetVideoBitrateBps();
                            const wantFps = Number(streamSettingsState.fps) || 60;
                            if (Array.isArray(params.encodings)) {
                                for (const enc of params.encodings) {
                                    enc.active = true;
                                    enc.scaleResolutionDownBy = 1.0;
                                    enc.maxBitrate = Math.max(Number(enc.maxBitrate) || 0, maxBr);
                                    enc.minBitrate = 3000000;
                                    enc.maxFramerate = Math.max(Number(enc.maxFramerate) || 0, wantFps);
                                    enc.priority = 'high';
                                    enc.networkPriority = 'high';
                                }
                            }
                        } else if (this.track && this.track === activeScreenShareAudioTrack && !userExplicitlyCheckedMuteStreamAudio) {
                            params = Object.assign({}, params || {});
                            if (Array.isArray(params.encodings)) {
                                for (const enc of params.encodings) {
                                    enc.active = true;
                                    enc.maxBitrate = 160000;
                                    enc.priority = 'high';
                                    enc.networkPriority = 'high';
                                }
                            }
                        }
                    } catch (e) {}
                    return origSetParams.call(this, params);
                };
            }
            window.RTCRtpSender.prototype.__lcHookedSetParams = true;
        }
    } catch (e) {}

    function upgradeStreamSdpBitrateAndAudio(rawSdp) {
        if (!rawSdp || typeof rawSdp !== 'string') return rawSdp;
        let sdp = rawSdp.replace(/a=fmtp:(\d+) minptime=10;useinbandfec=1([^\r\n]*)/g, (m, pt, tail) => {
            if (tail.includes('stereo=1')) return m;
            return `a=fmtp:${pt} minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=160000;usedtx=0${tail}`;
        });

        const sections = sdp.split(/(?=^m=)/m);
        for (let i = 0; i < sections.length; i++) {
            if (sections[i].startsWith('m=audio ') && !userExplicitlyCheckedMuteStreamAudio) {
                sections[i] = sections[i]
                    .replace(/^a=inactive\r?$/gm, 'a=sendrecv')
                    .replace(/^a=recvonly\r?$/gm, 'a=sendrecv');
            } else if (sections[i].startsWith('m=video ')) {
                // Remove any low bandwidth caps and inject high-bitrate Google WebRTC fmtp hints (3.5 - 16 Mbps)
                sections[i] = sections[i].replace(/^b=(?:AS|TIAS):[^\r\n]+\r?\n/gm, '');
                sections[i] = sections[i].replace(/(^c=IN [^\r\n]+\r?\n)/m, `$1b=AS:15000\r\nb=TIAS:15000000\r\n`);
                sections[i] = sections[i].replace(/^(a=fmtp:\d+ (?!.*apt=)[^\r\n]+?)(\r?\n)/gm, (m, line, crlf) => {
                    if (line.includes('x-google-max-bitrate')) return m;
                    return `${line};x-google-min-bitrate=3500;x-google-start-bitrate=8500;x-google-max-bitrate=16000${crlf}`;
                });
            }
        }
        return sections.join('');
    }

    // RTCPeerConnection Hook for Go-Live Stream Connection
    try {
        if (typeof window.RTCPeerConnection === 'function' && !window.RTCPeerConnection.__lcHookedPc) {
            const OrigPeerConnection = window.RTCPeerConnection;
            const origAddTrack = OrigPeerConnection.prototype.addTrack;
            const origAddTransceiver = OrigPeerConnection.prototype.addTransceiver;
            const origCreateOffer = OrigPeerConnection.prototype.createOffer;
            const origSetLocalDesc = OrigPeerConnection.prototype.setLocalDescription;
            const origSetRemoteDesc = OrigPeerConnection.prototype.setRemoteDescription;

            if (typeof origAddTrack === 'function') {
                OrigPeerConnection.prototype.addTrack = function(track, ...streams) {
                    const sender = origAddTrack.apply(this, [track, ...streams]);
                    try {
                        if (track && track === activeScreenShareVideoTrack) {
                            this.__lcIsScreenSharePc = true;
                            lcActiveGoLivePeerConnections.add(this);
                            enforceHighQualityOnVideoSender(sender);
                            if (activeScreenShareAudioTrack && activeScreenShareAudioTrack.readyState === 'live' && !userExplicitlyCheckedMuteStreamAudio) {
                                const hasAudioSender = this.getSenders().some(s => s && s.track && s.track.kind === 'audio');
                                if (!hasAudioSender && !this.__lcAddedAudioTrackOnce) {
                                    this.__lcAddedAudioTrackOnce = true;
                                    const targetStream = streams[0] || activeScreenShareStream;
                                    const aSender = targetStream
                                        ? origAddTrack.call(this, activeScreenShareAudioTrack, targetStream)
                                        : origAddTrack.call(this, activeScreenShareAudioTrack);
                                    enforceHighQualityOnAudioSender(aSender);
                                }
                            }
                        }
                        if (this.__lcIsScreenSharePc && track && track.kind === 'audio' && !userExplicitlyCheckedMuteStreamAudio) {
                            track.enabled = true;
                        }
                    } catch (e) {}
                    return sender;
                };
            }

            if (typeof origAddTransceiver === 'function') {
                OrigPeerConnection.prototype.addTransceiver = function(trackOrKind, init) {
                    try {
                        if (trackOrKind && trackOrKind === activeScreenShareVideoTrack) {
                            this.__lcIsScreenSharePc = true;
                            lcActiveGoLivePeerConnections.add(this);
                        }
                        if (this.__lcIsScreenSharePc && (trackOrKind === 'audio' || (trackOrKind && trackOrKind.kind === 'audio'))) {
                            init = Object.assign({}, init || {});
                            if (init.direction === 'inactive' || init.direction === 'recvonly') {
                                init.direction = 'sendrecv';
                            }
                            if (trackOrKind === 'audio' && activeScreenShareAudioTrack && activeScreenShareAudioTrack.readyState === 'live') {
                                trackOrKind = activeScreenShareAudioTrack;
                                this.__lcAddedAudioTrackOnce = true;
                            }
                        }
                    } catch (e) {}
                    const tr = origAddTransceiver.call(this, trackOrKind, init);
                    try {
                        if (this.__lcIsScreenSharePc && tr && tr.sender) {
                            if (tr.sender.track === activeScreenShareVideoTrack) enforceHighQualityOnVideoSender(tr.sender);
                            if (tr.sender.track === activeScreenShareAudioTrack) enforceHighQualityOnAudioSender(tr.sender);
                        }
                    } catch (e) {}
                    return tr;
                };
            }

            if (typeof origCreateOffer === 'function') {
                OrigPeerConnection.prototype.createOffer = function(...args) {
                    try {
                        const senders = this.getSenders ? this.getSenders() : [];
                        const isGoLivePc = this.__lcIsScreenSharePc
                            || (activeScreenShareVideoTrack && senders.some(s => s && s.track === activeScreenShareVideoTrack));

                        if (isGoLivePc) {
                            this.__lcIsScreenSharePc = true;
                            lcActiveGoLivePeerConnections.add(this);
                            for (const s of senders) {
                                if (s && s.track && s.track.kind === 'video') {
                                    enforceHighQualityOnVideoSender(s);
                                }
                            }
                        }

                        if (isGoLivePc && activeScreenShareAudioTrack && activeScreenShareAudioTrack.readyState === 'live' && !userExplicitlyCheckedMuteStreamAudio) {
                            activeScreenShareAudioTrack.enabled = true;
                            const transceivers = this.getTransceivers ? this.getTransceivers() : [];
                            let attachedToTransceiver = false;
                            for (const tr of transceivers) {
                                const isAudioTr = (tr.receiver && tr.receiver.track && tr.receiver.track.kind === 'audio')
                                    || (tr.sender && tr.sender.track && tr.sender.track.kind === 'audio');
                                if (isAudioTr && tr.sender) {
                                    if (tr.direction === 'inactive' || tr.direction === 'recvonly') {
                                        try { tr.direction = 'sendrecv'; } catch (e) {}
                                    }
                                    if (tr.sender.track !== activeScreenShareAudioTrack) {
                                        try { tr.sender.replaceTrack(activeScreenShareAudioTrack); } catch (e) {}
                                    }
                                    enforceHighQualityOnAudioSender(tr.sender);
                                    attachedToTransceiver = true;
                                }
                            }
                            if (!attachedToTransceiver && !this.__lcAddedAudioTrackOnce && typeof origAddTrack === 'function') {
                                const hasAudioSender = senders.some(s => s && s.track && s.track.kind === 'audio');
                                if (!hasAudioSender) {
                                    this.__lcAddedAudioTrackOnce = true;
                                    const aSender = activeScreenShareStream
                                        ? origAddTrack.call(this, activeScreenShareAudioTrack, activeScreenShareStream)
                                        : origAddTrack.call(this, activeScreenShareAudioTrack);
                                    enforceHighQualityOnAudioSender(aSender);
                                }
                            }
                        }
                    } catch (e) {}
                    return origCreateOffer.apply(this, args);
                };
            }

            if (typeof origSetLocalDesc === 'function') {
                OrigPeerConnection.prototype.setLocalDescription = function(desc, ...rest) {
                    try {
                        if (this.__lcIsScreenSharePc && desc && typeof desc.sdp === 'string') {
                            desc = new RTCSessionDescription({
                                type: desc.type,
                                sdp: upgradeStreamSdpBitrateAndAudio(desc.sdp)
                            });
                        }
                    } catch (e) {}
                    return origSetLocalDesc.apply(this, [desc, ...rest]);
                };
            }

            if (typeof origSetRemoteDesc === 'function') {
                OrigPeerConnection.prototype.setRemoteDescription = function(desc, ...rest) {
                    try {
                        if (this.__lcIsScreenSharePc && desc && typeof desc.sdp === 'string') {
                            desc = new RTCSessionDescription({
                                type: desc.type,
                                sdp: upgradeStreamSdpBitrateAndAudio(desc.sdp)
                            });
                        }
                    } catch (e) {}
                    return origSetRemoteDesc.apply(this, [desc, ...rest]);
                };
            }

            OrigPeerConnection.__lcHookedPc = true;
        }
    } catch (e) {}

    // Direct Native Screen Share Picker + Unified Draggable "DisCRust Stream & Privacy" Hub
    try {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
            const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getDisplayMedia = async function(constraints) {
                ensureGoLiveFluxAudioUnmutedHook();
                ensureVencordStreamQualityEnabled();
                stopAndCleanupScreenShareAudio();

                try {
                    const AudioCtxCtor = window.AudioContext || window.webkitAudioContext;
                    if (AudioCtxCtor) {
                        if (!lcLoopbackAudioCtx || lcLoopbackAudioCtx.state === 'closed') {
                            lcLoopbackAudioCtx = new AudioCtxCtor({ sampleRate: 48000, latencyHint: 'interactive' });
                            lcAudioWorkletReady = false;
                        }
                        if (lcLoopbackAudioCtx.state === 'suspended') {
                            lcLoopbackAudioCtx.resume().catch(() => {});
                        }
                    }
                } catch (e) {}

                sendHost('SCREENSHARE_PICKER_OPENED');
                sendHost('SCAN_CAPTURABLE_WINDOWS');

                if (streamSettingsState.showPrivacyOverlay !== false) {
                    showUnifiedStreamAndPrivacyHub(false);
                }

                let capCtrl = null;
                if (typeof window.CaptureController === 'function') {
                    try {
                        capCtrl = new window.CaptureController();
                        if (typeof capCtrl.setFocusBehavior === 'function') {
                            capCtrl.setFocusBehavior('no-focus-change');
                        }
                    } catch (e) {}
                }

                const resMode = streamSettingsState.resolution;
                const wantW = resMode === '720' ? 1280 : (resMode === '1080' ? 1920 : (resMode === '1440' ? 2560 : 3840));
                const wantH = resMode === '720' ? 720 : (resMode === '1080' ? 1080 : (resMode === '1440' ? 1440 : 2160));
                const wantFps = Number(streamSettingsState.fps) || 60;
                const wantAudio = (!constraints || constraints.audio !== false);

                const videoConstraints = Object.assign(
                    (constraints && typeof constraints.video === 'object') ? constraints.video : {},
                    {
                        width: { ideal: wantW, max: 3840 },
                        height: { ideal: wantH, max: 2160 },
                        frameRate: { ideal: wantFps, max: wantFps }
                    }
                );
                const audioConstraints = wantAudio
                    ? {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        channelCount: 2,
                        sampleRate: 48000,
                        systemAudio: 'include',
                        windowAudio: 'system',
                        suppressLocalAudioPlayback: false
                    }
                    : false;

                const finalConstraints = Object.assign({}, constraints || {}, {
                    video: videoConstraints,
                    audio: audioConstraints,
                    systemAudio: wantAudio ? 'include' : 'exclude',
                    windowAudio: wantAudio ? 'system' : 'exclude',
                    selfBrowserSurface: 'exclude',
                    surfaceSwitching: 'include',
                    monitorTypeSurfaces: 'include'
                });
                if (capCtrl) {
                    finalConstraints.controller = capCtrl;
                }

                try {
                    let stream = null;
                    try {
                        stream = await origGetDisplayMedia(finalConstraints);
                    } catch (firstErr) {
                        if (firstErr && firstErr.name === 'NotAllowedError') {
                            throw firstErr;
                        }
                        stream = await origGetDisplayMedia({ video: true, audio: true });
                    }
                    if (capCtrl && typeof capCtrl.setFocusBehavior === 'function') {
                        try { capCtrl.setFocusBehavior('no-focus-change'); } catch (e) {}
                    }

                    const vTrack = stream.getVideoTracks()[0] || null;
                    activeScreenShareVideoTrack = vTrack;
                    activeScreenShareStream = stream;

                    const rawSettings = (vTrack && typeof vTrack.getSettings === 'function') ? (vTrack.getSettings() || {}) : {};
                    const rawSurface = String(rawSettings.displaySurface || 'window');
                    lcRawPickedSurface = rawSurface;
                    const rawDeviceId = String(rawSettings.deviceId || '');
                    const rawLabel = String((vTrack && vTrack.label) || '');
                    const rawWidth = Number(rawSettings.width) || 0;
                    const rawHeight = Number(rawSettings.height) || 0;
                    const isMonitorSurface = (rawSurface === 'monitor')
                        || rawDeviceId.toLowerCase().startsWith('screen:')
                        || rawLabel.toLowerCase().startsWith('screen:');

                    const explicitPid = isMonitorSurface
                        ? -1
                        : (Number(streamSettingsState.selectedAppPid) || 0);

                    const targetSpecJson = JSON.stringify({
                        surface: isMonitorSurface ? 'monitor' : 'window',
                        deviceId: rawDeviceId,
                        label: rawLabel,
                        width: rawWidth,
                        height: rawHeight,
                        explicitPid: explicitPid
                    });

                    sendHost('SCREENSHARE_STREAM_ACQUIRED');

                    if (wantAudio && !userExplicitlyCheckedMuteStreamAudio) {
                        sendHost('START_AUDIO_LOOPBACK:' + targetSpecJson);
                        const mixedTrack = await createProcessLoopbackRingBufferAudioTrack(stream, isMonitorSurface);
                        if (mixedTrack) {
                            for (const oldT of stream.getAudioTracks()) {
                                if (oldT !== mixedTrack) {
                                    try { stream.removeTrack(oldT); } catch (e) {}
                                }
                            }
                            try { stream.addTrack(mixedTrack); } catch (e) {}
                            activeScreenShareAudioTrack = mixedTrack;
                        }
                    } else {
                        sendHost('STOP_AUDIO_LOOPBACK');
                    }

                    decorateScreenShareVideoAndAudioTracks(stream);
                    applyLiveStreamQualityConstraints();

                    if (streamHubState.visible) {
                        streamHubState.minimized = true;
                        renderUnifiedStreamAndPrivacyHub();
                    }

                    const onStreamEnded = () => {
                        stopAndCleanupScreenShareAudio();
                        if (activeScreenShareVideoTrack === vTrack) {
                            activeScreenShareVideoTrack = null;
                            activeScreenShareAudioTrack = null;
                            activeScreenShareStream = null;
                        }
                        if (streamSettingsState.autoDisablePrivacyAfterStream !== false) {
                            turnOffAllPrivacySettingsAutomatically();
                        }
                        if (!streamHubState.openedManuallyBetweenStreams) {
                            hideUnifiedStreamAndPrivacyHub();
                        } else {
                            renderUnifiedStreamAndPrivacyHub();
                        }
                        setTimeout(pollAndSyncTaskbarAndTrayState, 150);
                    };

                    if (vTrack) {
                        vTrack.addEventListener('ended', onStreamEnded);
                        let watchdogTicks = 0;
                        lcStreamWatchdogInterval = setInterval(() => {
                            watchdogTicks++;
                            if (!vTrack || vTrack.readyState === 'ended') {
                                onStreamEnded();
                                return;
                            }
                            if (lcLoopbackAudioCtx && lcLoopbackAudioCtx.state !== 'running') {
                                lcLoopbackAudioCtx.resume().catch(() => {});
                            }
                            if (activeScreenShareAudioTrack && !userExplicitlyCheckedMuteStreamAudio) {
                                activeScreenShareAudioTrack.enabled = true;
                            }
                            // Continuously guard Go-Live RTCPeerConnections so audio & high-bitrate video never drop mid-stream!
                            for (const pc of lcActiveGoLivePeerConnections) {
                                try {
                                    if (!pc || pc.connectionState === 'closed') {
                                        lcActiveGoLivePeerConnections.delete(pc);
                                        continue;
                                    }
                                    const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
                                    for (const tr of transceivers) {
                                        if (!tr || !tr.sender) continue;
                                        if (tr.sender.track === activeScreenShareVideoTrack || (tr.sender.track && tr.sender.track.kind === 'video')) {
                                            if (watchdogTicks % 4 === 1) enforceHighQualityOnVideoSender(tr.sender);
                                        }
                                        const isAudioTr = (tr.receiver && tr.receiver.track && tr.receiver.track.kind === 'audio')
                                            || (tr.sender && tr.sender.track && tr.sender.track.kind === 'audio');
                                        if (isAudioTr && activeScreenShareAudioTrack && activeScreenShareAudioTrack.readyState === 'live' && !userExplicitlyCheckedMuteStreamAudio) {
                                            if (tr.direction === 'inactive' || tr.direction === 'recvonly') {
                                                try { tr.direction = 'sendrecv'; } catch (e) {}
                                            }
                                            if (tr.sender.track !== activeScreenShareAudioTrack) {
                                                try { tr.sender.replaceTrack(activeScreenShareAudioTrack); } catch (e) {}
                                            }
                                        }
                                    }
                                } catch (e) {}
                            }
                            // Keep Discord's stream audio SSRC speaking flag alive every 1.8s
                            if (watchdogTicks % 4 === 0 && !userExplicitlyCheckedMuteStreamAudio) {
                                for (const ws of lcActiveMediaWebSockets) {
                                    try {
                                        if (ws.readyState === 1 && ws.__lcIsStreamWs && ws.__lcBaseSsrc) {
                                            ws.__lcOrigSend(JSON.stringify({
                                                op: 5,
                                                d: { speaking: 2, delay: 0, ssrc: ws.__lcBaseSsrc }
                                            }));
                                        }
                                    } catch (e) {}
                                }
                            }
                        }, 450);
                    }

                    setTimeout(() => sendHost('HIDE_SCREENSHARE_POPUP'), 80);
                    setTimeout(() => sendHost('HIDE_SCREENSHARE_POPUP'), 250);
                    setTimeout(() => sendHost('HIDE_SCREENSHARE_POPUP'), 600);
                    setTimeout(() => sendHost('HIDE_SCREENSHARE_POPUP'), 1200);
                    setTimeout(applyLiveStreamQualityConstraints, 900);
                    setTimeout(applyLiveStreamQualityConstraints, 2200);
                    setTimeout(pollAndSyncTaskbarAndTrayState, 400);
                    return stream;
                } catch (err) {
                    stopAndCleanupScreenShareAudio();
                    sendHost('HIDE_SCREENSHARE_POPUP');
                    if (!streamHubState.openedManuallyBetweenStreams) {
                        if (streamSettingsState.autoDisablePrivacyAfterStream !== false) {
                            turnOffAllPrivacySettingsAutomatically();
                        }
                        hideUnifiedStreamAndPrivacyHub();
                    }
                    throw err;
                }
            };
        }
    } catch (e) {}

    const lcNavStack = [];
    let lcNavIndex = -1;
    let lcNavInternalTransition = false;

    function isValidDiscordAppRoute(path) {
        if (!path || typeof path !== 'string') return false;
        if (path === '/' || path === '/app' || path.startsWith('/login') || path.startsWith('/register') || path.startsWith('/oauth2')) {
            return false;
        }
        return path.startsWith('/channels')
            || path.startsWith('/discovery')
            || path.startsWith('/store')
            || path.startsWith('/shop')
            || path.startsWith('/message-requests')
            || path.startsWith('/family-center')
            || path.startsWith('/guild-discovery')
            || path.startsWith('/activities');
    }

    function updateNavButtonsVisualState() {
        const backBtn = document.getElementById('lc-tb-nav-back');
        const fwdBtn = document.getElementById('lc-tb-nav-fwd');
        const canBack = lcNavIndex > 0;
        const canFwd = lcNavIndex >= 0 && lcNavIndex < lcNavStack.length - 1;
        if (backBtn) {
            backBtn.classList.toggle('disabled', !canBack);
            backBtn.disabled = !canBack;
        }
        if (fwdBtn) {
            fwdBtn.classList.toggle('disabled', !canFwd);
            fwdBtn.disabled = !canFwd;
        }
    }

    function recordDiscordRouteChange(rawPath) {
        try {
            const path = String(rawPath || (window.location.pathname + window.location.search));
            if (!isValidDiscordAppRoute(path)) {
                updateNavButtonsVisualState();
                return;
            }
            if (lcNavInternalTransition) {
                updateNavButtonsVisualState();
                return;
            }
            if (lcNavIndex >= 0 && lcNavStack[lcNavIndex] === path) {
                updateNavButtonsVisualState();
                return;
            }
            if (lcNavIndex > 0 && lcNavStack[lcNavIndex - 1] === path) {
                lcNavIndex--;
                updateNavButtonsVisualState();
                return;
            }
            if (lcNavIndex >= 0 && lcNavIndex + 1 < lcNavStack.length && lcNavStack[lcNavIndex + 1] === path) {
                lcNavIndex++;
                updateNavButtonsVisualState();
                return;
            }
            lcNavStack.splice(lcNavIndex + 1);
            lcNavStack.push(path);
            if (lcNavStack.length > 60) {
                lcNavStack.shift();
            }
            lcNavIndex = lcNavStack.length - 1;
            updateNavButtonsVisualState();
        } catch (e) {}
    }

    try {
        const origPushState = window.history.pushState.bind(window.history);
        const origReplaceState = window.history.replaceState.bind(window.history);
        window.history.pushState = function(state, unused, url) {
            const ret = origPushState(state, unused, url);
            recordDiscordRouteChange(window.location.pathname + window.location.search);
            return ret;
        };
        window.history.replaceState = function(state, unused, url) {
            const ret = origReplaceState(state, unused, url);
            recordDiscordRouteChange(window.location.pathname + window.location.search);
            return ret;
        };
        window.addEventListener('popstate', () => {
            recordDiscordRouteChange(window.location.pathname + window.location.search);
        });
        recordDiscordRouteChange(window.location.pathname + window.location.search);
    } catch (e) {}

    function navigateDiscordToRoute(targetPath) {
        if (!targetPath) return;
        lcNavInternalTransition = true;
        try {
            scanReactFiberForStores();
            resolveDiscordModules();

            // 1. Dispatch Flux CHANNEL_SELECT if navigating to a DM or Server Channel
            const chMatch = String(targetPath).match(/^\/channels\/(@me|\d+)\/(\d+)(?:\/(\d+))?/);
            if (chMatch) {
                const gId = chMatch[1] === '@me' ? null : chMatch[1];
                const cId = chMatch[2];
                const mId = chMatch[3] || undefined;
                const fd = cachedFluxDispatcher || window.Vencord?.Webpack?.Common?.FluxDispatcher;
                if (fd && typeof fd.dispatch === 'function') {
                    try {
                        fd.dispatch({
                            type: 'CHANNEL_SELECT',
                            guildId: gId,
                            channelId: cId,
                            messageId: mId
                        });
                    } catch (e) {}
                }
            }

            // 2. Try Vencord's NavigationRouter / ChannelRouter if available
            if (window.Vencord?.Webpack?.Common?.NavigationRouter?.transitionTo) {
                window.Vencord.Webpack.Common.NavigationRouter.transitionTo(targetPath);
                setTimeout(() => { lcNavInternalTransition = false; updateNavButtonsVisualState(); }, 60);
                return;
            }

            // 3. Scan both webpackCaches and allLoadedModules for transitionTo
            const allMods = [];
            for (const cObj of webpackCaches) {
                if (cObj && typeof cObj === 'object') {
                    for (const m of Object.values(cObj)) allMods.push(m);
                }
            }
            for (const m of allLoadedModules.values()) allMods.push(m);

            for (const m of allMods) {
                const ex = m?.exports;
                if (!ex || typeof ex !== 'object') continue;
                for (const k of Object.keys(ex)) {
                    let candidate = null;
                    try { candidate = ex[k]; } catch { continue; }
                    if (candidate && typeof candidate.transitionTo === 'function') {
                        candidate.transitionTo(targetPath);
                        setTimeout(() => { lcNavInternalTransition = false; updateNavButtonsVisualState(); }, 60);
                        return;
                    }
                }
            }

            // 4. Try clicking a matching anchor in the DOM if visible, otherwise pushState + popstate
            const baseRoute = chMatch ? `/channels/${chMatch[1]}/${chMatch[2]}` : targetPath;
            const domLink = document.querySelector(`a[href="${baseRoute}"], a[href^="${baseRoute}"]`);
            if (domLink && typeof domLink.click === 'function') {
                domLink.click();
            } else {
                window.history.pushState({}, '', targetPath);
                window.dispatchEvent(new PopStateEvent('popstate'));
            }
        } catch (e) {}
        setTimeout(() => { lcNavInternalTransition = false; updateNavButtonsVisualState(); }, 60);
    }

    function performCleanNavBack() {
        if (lcNavIndex <= 0) return;
        lcNavIndex--;
        const target = lcNavStack[lcNavIndex];
        updateNavButtonsVisualState();
        navigateDiscordToRoute(target);
    }

    function performCleanNavForward() {
        if (lcNavIndex < 0 || lcNavIndex >= lcNavStack.length - 1) return;
        lcNavIndex++;
        const target = lcNavStack[lcNavIndex];
        updateNavButtonsVisualState();
        navigateDiscordToRoute(target);
    }

    function suppressDuplicateDiscordTitleBar() {
        try {
            document.documentElement.style.setProperty('--custom-app-top-bar-height', '0px', 'important');
            if (document.body) {
                document.body.style.setProperty('--custom-app-top-bar-height', '0px', 'important');
            }
            const appMount = document.getElementById('app-mount');
            if (appMount) {
                appMount.style.setProperty('--custom-app-top-bar-height', '0px', 'important');
                const dupBars = appMount.querySelectorAll(
                    "div[class*='titleBar_'], div[class*='typeWindows_'], div[class*='withFrame_'], div[class*='winButtons_'], div[class*='base_'] > div[class*='bar_'], div[class*='app_'] > div[class*='bar_']"
                );
                for (const el of dupBars) {
                    if (el.id !== 'lc-discord-titlebar') {
                        el.style.setProperty('display', 'none', 'important');
                        el.style.setProperty('height', '0px', 'important');
                        el.style.setProperty('min-height', '0px', 'important');
                        el.style.setProperty('max-height', '0px', 'important');
                        el.style.setProperty('overflow', 'hidden', 'important');
                    }
                }
                // Handled via static CSS instead of per-node getBoundingClientRect() layout reflow
            }
        } catch (e) {}
    }

    // ------------------------------------------------------------------------
    // 3E. FULL ADAPTIVE DISCORD TITLEBAR (Supports Blue, Gradient, Light & Nitro Themes!)
    // ------------------------------------------------------------------------
    let titleBarQuestOnlyBtn = null;
    let patchNotesModal = null;
    let lastSyncedDwmColorKey = '';

    function getConfiguredTitleBarIconHtml() {
        const style = (cfg && cfg.ConfigIconStyle) ? String(cfg.ConfigIconStyle) : 'Sliders';
        if (style === 'Custom' && cfg && cfg.AppIconPreviewDataUri) {
            return `<img src='${cfg.AppIconPreviewDataUri}' alt='' style='width:16px;height:16px;border-radius:4px;object-fit:cover;display:block;' />`;
        }
        if (style === 'Gear') return MSR.settings;
        if (style === 'Bolt') return DISCRUST_EMBLEM_SVG;
        if (style === 'Shield') return MSR.shield;
        return MSR.tune;
    }

    let __lcColorCanvas = null;
    let __lcColorCtx = null;
    let __lcThemeProbeEl = null;
    let __lcThemeObserverMounted = false;

    // Universal CSS Color 4 resolver using a 1x1 HTML5 Canvas 2D context.
    // Converts oklab(...), oklch(...), color(srgb ...), color-mix(...), hsl(...), rgb(...), and #hex into exact [R, G, B, A].
    function resolveCssColorToRgba(str) {
        if (!str || typeof str !== 'string') return null;
        const s = str.trim();
        if (!s || s === 'transparent' || s === 'none' || s === 'inherit' || s === 'initial' || s === 'unset') {
            return null;
        }
        if (s === 'rgba(0, 0, 0, 0)' || s === 'oklab(0 0 0 / 0)' || s === 'color(srgb 0 0 0 / 0)') {
            return null;
        }
        try {
            if (!__lcColorCtx) {
                __lcColorCanvas = document.createElement('canvas');
                __lcColorCanvas.width = 1;
                __lcColorCanvas.height = 1;
                __lcColorCtx = __lcColorCanvas.getContext('2d', { willReadFrequently: true });
            }
            __lcColorCtx.clearRect(0, 0, 1, 1);
            __lcColorCtx.fillStyle = 'rgba(0, 0, 0, 0)';
            __lcColorCtx.fillStyle = s;
            __lcColorCtx.fillRect(0, 0, 1, 1);
            const d = __lcColorCtx.getImageData(0, 0, 1, 1).data;
            const alpha = d[3] / 255.0;
            if (alpha < 0.02) return null;
            return [d[0], d[1], d[2], alpha];
        } catch (e) {
            return null;
        }
    }

    const parseFirstRgbTuple = resolveCssColorToRgba;



    function extractAllColorsFromCssText(txt) {
        if (!txt || typeof txt !== 'string') return [];
        const out = [];
        const re = /(?:rgba?|hsla?|oklab|oklch|lab|lch|color)\([^)]+\)|#[0-9a-fA-F]{3,8}\b/gi;
        let m;
        while ((m = re.exec(txt)) !== null) {
            const rgba = resolveCssColorToRgba(m[0]);
            if (rgba) out.push(rgba);
        }
        return out;
    }

    function ensureThemeProbeAndObserver() {
        const appMount = document.getElementById('app-mount');
        if (appMount && (!__lcThemeProbeEl || !__lcThemeProbeEl.isConnected)) {
            const targetRoot = appMount.querySelector('div[class*="app_"]') || appMount;
            __lcThemeProbeEl = document.createElement('div');
            __lcThemeProbeEl.id = 'lc-theme-color-probe';
            __lcThemeProbeEl.style.cssText = 'position:fixed !important;top:-9999px !important;left:-9999px !important;width:1px !important;height:1px !important;pointer-events:none !important;opacity:0 !important;background-color:var(--bg-base-primary, var(--background-primary, var(--background-tertiary, transparent))) !important;background-image:var(--custom-theme-background, none) !important;';
            targetRoot.appendChild(__lcThemeProbeEl);
        }
        if (!__lcThemeObserverMounted && document.documentElement) {
            __lcThemeObserverMounted = true;
            try {
                const obs = new MutationObserver(() => {
                    syncAdaptiveTitleBarTheme();
                });
                obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-client-theme'] });
                if (document.body) {
                    obs.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
                }
                if (appMount) {
                    obs.observe(appMount, { attributes: true, subtree: false, attributeFilter: ['class', 'style'] });
                }
            } catch (e) {}
        }
    }

    // Seamlessly adapts the Title Bar to Discord's exact background theme (Onyx #000000, Dark, Ash, Light, or Nitro Color/Gradient themes).
    // Uses Canvas 2D pixel resolution so modern oklab() / color-mix() tokens in Chromium 120+ resolve to exact RGB values,
    // ignores document.body's static #111214 splash fallback once Discord mounts, and never samples small buttons/icons.
    function syncAdaptiveTitleBarTheme() {
        if (!discordTitleBar) return;
        suppressDuplicateDiscordTitleBar();
        ensureThemeProbeAndObserver();
        recordDiscordRouteChange(window.location.pathname + window.location.search);

        try {
            const rootClasses = (document.documentElement.className || '') + ' ' + (document.body ? document.body.className : '');
            const isLightRoot = rootClasses.includes('theme-light');
            const isMidnightRoot = rootClasses.includes('theme-midnight') || rootClasses.includes('theme-onyx');

            let baseR = isLightRoot ? 242 : (isMidnightRoot ? 0 : 17);
            let baseG = isLightRoot ? 243 : (isMidnightRoot ? 0 : 18);
            let baseB = isLightRoot ? 245 : (isMidnightRoot ? 0 : 20);
            let hasResolvedThemeColor = false;

            const isDiscordBlurpleButtonColor = (r, g, b) => {
                return (r >= 70 && r <= 105 && g >= 85 && g <= 120 && b >= 220 && b <= 255);
            };

            const blendRgba = (rgba) => {
                if (!rgba) return;
                const [sr, sg, sb, sa] = rgba;
                if (sa <= 0.02) return;
                if (isDiscordBlurpleButtonColor(sr, sg, sb)) return;
                const a = Math.min(1, Math.max(0, sa));
                if (!hasResolvedThemeColor && a >= 0.85) {
                    baseR = Math.round(sr);
                    baseG = Math.round(sg);
                    baseB = Math.round(sb);
                    hasResolvedThemeColor = true;
                } else {
                    baseR = Math.round(sr * a + baseR * (1 - a));
                    baseG = Math.round(sg * a + baseG * (1 - a));
                    baseB = Math.round(sb * a + baseB * (1 - a));
                    hasResolvedThemeColor = true;
                }
            };

            // 1. Check CSS variable probe inside #app-mount first
            let activeGradientCss = '';
            let topOverlayRgba = null;

            if (__lcThemeProbeEl && __lcThemeProbeEl.isConnected) {
                const pcs = window.getComputedStyle(__lcThemeProbeEl);
                const pBgImg = pcs.backgroundImage || '';
                const pBgCol = pcs.backgroundColor || '';
                if (pBgImg && pBgImg !== 'none' && (pBgImg.includes('gradient') || pBgImg.includes('url('))) {
                    activeGradientCss = pBgImg;
                    const stops = extractAllColorsFromCssText(pBgImg);
                    if (stops.length > 0) {
                        blendRgba([stops[0][0], stops[0][1], stops[0][2], 1.0]);
                    }
                }
                const pRgba = resolveCssColorToRgba(pBgCol);
                if (pRgba) {
                    blendRgba(pRgba);
                }
            }

            // 2. Collect wide structural layout containers (never small buttons, icons, search inputs, or badges)
            const candidateNodes = [];
            const seen = new Set();
            const addCandidate = (el, allowBodyFallback) => {
                if (!el || el.nodeType !== 1 || seen.has(el)) return;
                if (el.id && (el.id.startsWith('lc-') || el.id.startsWith('litecord-'))) return;
                if (el.closest && (el.closest('#lc-discord-titlebar') || el.closest('#litecord-dropdown-menu') || el.closest('#litecord-quest-hud'))) return;
                if (!allowBodyFallback && (el === document.body || el === document.documentElement)) {
                    // Only inspect html/body for gradients, not body's static #111214 fallback
                    const cs = window.getComputedStyle(el);
                    const bgImg = cs.backgroundImage || '';
                    if (bgImg && bgImg !== 'none' && (bgImg.includes('gradient') || bgImg.includes('url('))) {
                        seen.add(el);
                        candidateNodes.push({ el, gradientOnly: true });
                    }
                    return;
                }
                const tag = (el.tagName || '').toLowerCase();
                if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'svg' || tag === 'path' || tag === 'img' || tag === 'span' || tag === 'li' || tag === 'ol' || tag === 'article' || tag === 'blockquote') return;
                const role = el.getAttribute ? (el.getAttribute('role') || '') : '';
                if (role === 'button' || role === 'listitem' || role === 'tab' || role === 'textbox' || role === 'searchbox' || role === 'log' || role === 'article' || role === 'group') return;
                const cls = (typeof el.className === 'string') ? el.className : '';
                if (/message|mentioned|replied|embed|markup|attachment|reaction|cozy|compact|scrollerInner/i.test(cls)) return;
                if (el.closest && el.closest('li[id^="chat-messages-"], [class*="message_"], [class*="mentioned_"], [class*="messageListItem_"], [class*="scrollerInner_"], [data-list-id="chat-messages"], [role="log"]')) return;
                const rect = el.getBoundingClientRect();
                if (rect.width < 220 || rect.height < 34) return;
                seen.add(el);
                candidateNodes.push({ el, gradientOnly: false });
            };

            addCandidate(document.documentElement, false);
            addCandidate(document.body, false);

            const appMount = document.getElementById('app-mount');
            if (appMount) {
                const structuralSelectors = [
                    '#app-mount > div',
                    'div[class*="app_"]',
                    'div[class*="bg_"]',
                    'div[class*="base_"]',
                    'div[class*="page_"]',
                    'div[class*="content_"]',
                    'div[class*="sidebar_"]',
                    'div[class*="chat_"]',
                    'main[class*="chatContent_"]',
                    'div[class*="container_"]',
                    'section[class*="title_"]'
                ];
                for (const sel of structuralSelectors) {
                    const found = appMount.querySelector(sel);
                    if (found) addCandidate(found, true);
                }
            }

            // Only sample the top header bar at y=46 (never y=130 where highlighted chat messages appear in small windows!)
            const sampleX = Math.min(window.innerWidth - 120, Math.max(260, Math.round(window.innerWidth * 0.55)));
            for (const sampleY of [46]) {
                if (sampleX > 0 && sampleY < window.innerHeight) {
                    const stack = document.elementsFromPoint(sampleX, sampleY).reverse();
                    for (const node of stack) {
                        addCandidate(node, false);
                    }
                }
            }

            for (const item of candidateNodes) {
                const cs = window.getComputedStyle(item.el);
                const bgImg = cs.backgroundImage || '';
                const bgCol = cs.backgroundColor || '';

                if (bgImg && bgImg !== 'none' && (bgImg.includes('gradient') || bgImg.includes('url('))) {
                    activeGradientCss = bgImg;
                    const stops = extractAllColorsFromCssText(bgImg);
                    if (stops.length > 0) {
                        blendRgba([stops[0][0], stops[0][1], stops[0][2], 1.0]);
                    }
                }
                if (!item.gradientOnly && bgCol && bgCol !== 'transparent' && bgCol !== 'rgba(0, 0, 0, 0)') {
                    const parsed = resolveCssColorToRgba(bgCol);
                    if (parsed && !isDiscordBlurpleButtonColor(parsed[0], parsed[1], parsed[2])) {
                        blendRgba(parsed);
                        if (parsed[3] < 0.94 && activeGradientCss) {
                            topOverlayRgba = parsed;
                        }
                    }
                }
            }

            const finalSolidCss = `rgb(${baseR}, ${baseG}, ${baseB})`;
            if (activeGradientCss) {
                if (topOverlayRgba) {
                    const [or, og, ob, oa] = topOverlayRgba;
                    discordTitleBar.style.backgroundImage = `linear-gradient(rgba(${or}, ${og}, ${ob}, ${oa}), rgba(${or}, ${og}, ${ob}, ${oa})), ${activeGradientCss}`;
                } else {
                    discordTitleBar.style.backgroundImage = activeGradientCss;
                }
                discordTitleBar.style.backgroundAttachment = 'fixed';
                discordTitleBar.style.backgroundPosition = '0 0';
                discordTitleBar.style.backgroundSize = '100vw 100vh';
                discordTitleBar.style.backgroundColor = finalSolidCss;
            } else {
                discordTitleBar.style.backgroundImage = 'none';
                discordTitleBar.style.background = finalSolidCss;
                discordTitleBar.style.backgroundColor = finalSolidCss;
            }
            discordTitleBar.style.borderBottom = 'none';
            discordTitleBar.style.boxShadow = 'none';

            const lum = (0.299 * baseR + 0.587 * baseG + 0.114 * baseB) / 255.0;
            const isLight = lum > 0.62 || isLightRoot;
            discordTitleBar.classList.toggle('lc-tb-light-mode', isLight);

            updateTitleBarCenterPageTitle();
            const dwmKey = `${baseR},${baseG},${baseB},${isLight ? 1 : 0}`;
            if (dwmKey !== lastSyncedDwmColorKey) {
                lastSyncedDwmColorKey = dwmKey;
                sendHost('SET_TITLEBAR_COLOR:' + dwmKey);
            }
        } catch (e) {}
    }

    function createDiscordAdaptiveTitleBar() {
        if (!document.body) return;
        const existing = document.getElementById('lc-discord-titlebar');
        if (existing) {
            discordTitleBar = existing;
            titleBarBtn = document.getElementById('litecord-titlebar-btn');
            titleBarQuestOnlyBtn = document.getElementById('litecord-tb-questonly-btn');
            updateTitleBarElements();
            return;
        }

        discordTitleBar = document.createElement('div');
        discordTitleBar.id = 'lc-discord-titlebar';
        discordTitleBar.innerHTML = `
            <div class='lc-tb-left'>
                <button id='lc-tb-nav-back' class='lc-tb-icon-btn disabled' title='Navigate Back'>${MSR.arrowBack}</button>
                <button id='lc-tb-nav-fwd' class='lc-tb-icon-btn disabled' title='Navigate Forward'>${MSR.arrowFwd}</button>
            </div>
            <div id='lc-tb-drag-region' class='lc-tb-center'>
                <div id='lc-tb-center-title' class='lc-tb-center-title'></div>
            </div>
            <div class='lc-tb-right'>
                <button id='lc-tb-ram-pill' title='Click to Clean Memory (Ctrl+Shift+M)' class='lc-tb-ram-btn'>
                    <span id='lc-tb-ram-text'>-- MB</span>
                </button>
                <button id='litecord-tb-questonly-btn' class='lc-tb-icon-btn' title='Quest Completer Interface (${getShortcutLabel("questOnly")})'>
                    ${MSR.target}
                </button>
                <button id='litecord-tb-shortcuts-btn' class='lc-tb-icon-btn' title='Keyboard Shortcuts & Remapping (${getShortcutLabel("shortcutsMenu")})'>
                    ${MSR.keyboard}
                </button>
                <button id='litecord-titlebar-btn' class='lc-tb-icon-btn' title='Configurations (${getShortcutLabel("configMenu")})'>
                    ${getConfiguredTitleBarIconHtml()}
                </button>
                <div class='lc-tb-divider'></div>
                <button id='lc-tb-win-min' class='lc-tb-win-btn' title='Minimize'>${MSR.winMin}</button>
                <button id='lc-tb-win-max' class='lc-tb-win-btn' title='Maximize'>${MSR.winMax}</button>
                <button id='lc-tb-win-close' class='lc-tb-win-btn lc-tb-win-close' title='Close'>${MSR.winClose}</button>
            </div>
        `;
        document.body.appendChild(discordTitleBar);
        titleBarBtn = document.getElementById('litecord-titlebar-btn');
        titleBarQuestOnlyBtn = document.getElementById('litecord-tb-questonly-btn');
        const tbShortcutsBtn = document.getElementById('litecord-tb-shortcuts-btn');
        if (tbShortcutsBtn) {
            tbShortcutsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openKeyboardShortcutsModal();
            });
        }

        const dirs = [
            { id: 'N', css: 'top:0;left:6px;right:6px;height:4px;cursor:ns-resize;' },
            { id: 'S', css: 'bottom:0;left:6px;right:6px;height:4px;cursor:ns-resize;' },
            { id: 'W', css: 'top:6px;bottom:6px;left:0;width:4px;cursor:ew-resize;' },
            { id: 'E', css: 'top:6px;bottom:6px;right:0;width:4px;cursor:ew-resize;' },
            { id: 'NW', css: 'top:0;left:0;width:7px;height:7px;cursor:nwse-resize;' },
            { id: 'NE', css: 'top:0;right:0;width:7px;height:7px;cursor:nesw-resize;' },
            { id: 'SW', css: 'bottom:0;left:0;width:7px;height:7px;cursor:nesw-resize;' },
            { id: 'SE', css: 'bottom:0;right:0;width:7px;height:7px;cursor:nwse-resize;' }
        ];
        for (const d of dirs) {
            const grip = document.createElement('div');
            grip.style.cssText = 'position:fixed;z-index:2147483647;' + d.css;
            grip.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    e.preventDefault();
                    sendHost('WIN_RESIZE_EDGE:' + d.id);
                }
            });
            document.body.appendChild(grip);
        }

        const dragRegion = document.getElementById('lc-tb-drag-region');
        dragRegion.addEventListener('mousedown', (e) => {
            if (e.button === 0) sendHost('WIN_DRAG_START');
        });
        dragRegion.addEventListener('dblclick', () => {
            sendHost('WIN_MAXIMIZE_TOGGLE');
        });

        document.getElementById('lc-tb-nav-back').addEventListener('click', (e) => {
            e.stopPropagation();
            performCleanNavBack();
        });
        document.getElementById('lc-tb-nav-fwd').addEventListener('click', (e) => {
            e.stopPropagation();
            performCleanNavForward();
        });
        document.getElementById('lc-tb-ram-pill').addEventListener('click', (e) => {
            e.stopPropagation();
            sendHost('TRIM_MEMORY');
        });
        titleBarQuestOnlyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.__lcSetQuestOnlyMode) {
                window.__lcSetQuestOnlyMode(!cfg.QuestOnlyModeActive, true);
            }
        });
        titleBarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.__litecordToggleMenu();
        });
        document.getElementById('lc-tb-win-min').addEventListener('click', () => sendHost('WIN_MINIMIZE'));
        document.getElementById('lc-tb-win-max').addEventListener('click', () => sendHost('WIN_MAXIMIZE_TOGGLE'));
        document.getElementById('lc-tb-win-close').addEventListener('click', () => sendHost('WIN_CLOSE'));

        updateTitleBarElements();
        updateNavButtonsVisualState();
        syncAdaptiveTitleBarTheme();
    }

    const DISCORD_FRIENDS_WAVE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="color:#949ba4;flex-shrink:0;display:block;"><path d="M13 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M3 5v-.75C3 3.56 3.56 3 4.25 3s1.24.56 1.33 1.25C6.12 8.65 9.46 12 13 12h1a8 8 0 0 1 8 8 2 2 0 0 1-2 2 .21.21 0 0 1-.2-.15 7.65 7.65 0 0 0-1.32-2.3c-.15-.2-.42-.06-.39.17l.25 2c.02.15-.1.28-.25.28H9a2 2 0 0 1-2-2v-2.22c0-1.57-.67-3.05-1.53-4.37A15.85 15.85 0 0 1 3 5Z"/></svg>`;
    let lastCenterTitleSig = '';

    function updateTitleBarCenterPageTitle() {
        const titleEl = document.getElementById('lc-tb-center-title');
        if (!titleEl) return;
        if (cfg.ShowTitleBarPageTitle === false) {
            titleEl.style.display = 'none';
            return;
        }
        titleEl.style.display = 'inline-flex';

        try {
            const path = window.location.pathname || '';
            let iconHtml = '';
            let labelText = '';

            if (cfg.QuestOnlyModeActive || path.startsWith('/discovery/quests')) {
                iconHtml = `<span style="color:#949ba4;display:flex;width:16px;height:16px;">${MSR.target}</span>`;
                labelText = 'Quests';
            } else if (path === '/channels/@me' || path === '/channels/@me/') {
                iconHtml = DISCORD_FRIENDS_WAVE_SVG;
                labelText = 'Friends';
            } else if (path.startsWith('/channels/@me/')) {
                const chId = path.split('/')[3] || '';
                const chStore = discoveredStoresByName.get('ChannelStore') || window.Vencord?.Webpack?.Common?.ChannelStore;
                const uStore = discoveredStoresByName.get('UserStore') || window.Vencord?.Webpack?.Common?.UserStore;
                const chObj = (chStore && typeof chStore.getChannel === 'function') ? chStore.getChannel(chId) : null;
                if (chObj) {
                    if (chObj.name) {
                        labelText = chObj.name;
                    } else if (Array.isArray(chObj.recipients) && chObj.recipients.length > 0 && uStore && typeof uStore.getUser === 'function') {
                        const rec = uStore.getUser(chObj.recipients[0]);
                        if (rec) {
                            labelText = rec.globalName || rec.global_name || rec.username || 'Direct Message';
                            const av = rec.avatar
                                ? `https://cdn.discordapp.com/avatars/${rec.id}/${rec.avatar}.png?size=64`
                                : `https://cdn.discordapp.com/embed/avatars/0.png`;
                            iconHtml = `<img src="${escapeHtmlSafe(av)}" alt="" style="width:16px;height:16px;border-radius:50%;object-fit:cover;flex-shrink:0;display:block;" />`;
                        }
                    }
                }
                if (!labelText) {
                    const hdrTitle = document.querySelector('section[class*="title_"] h1, section[class*="title_"] [class*="title_"]');
                    labelText = hdrTitle ? (hdrTitle.textContent || '').trim() : 'Direct Message';
                }
                if (!iconHtml) {
                    iconHtml = DISCORD_FRIENDS_WAVE_SVG;
                }
            } else if (path.startsWith('/channels/')) {
                const parts = path.split('/');
                const gId = parts[2] || '';
                const gStore = discoveredStoresByName.get('GuildStore') || window.Vencord?.Webpack?.Common?.GuildStore;
                const gObj = (gStore && typeof gStore.getGuild === 'function') ? gStore.getGuild(gId) : null;
                if (gObj) {
                    labelText = gObj.name || '';
                    if (gObj.icon) {
                        const gIconUrl = `https://cdn.discordapp.com/icons/${gId}/${gObj.icon}.png?size=64`;
                        iconHtml = `<img src="${escapeHtmlSafe(gIconUrl)}" alt="" style="width:16px;height:16px;border-radius:4px;object-fit:cover;flex-shrink:0;display:block;" />`;
                    }
                }
                if (!labelText) {
                    const domGuildHdr = document.querySelector('[class*="sidebar_"] header h1, [class*="sidebar_"] header h2, [class*="sidebar_"] [class*="name_"]');
                    if (domGuildHdr) labelText = (domGuildHdr.textContent || '').trim();
                }
                if (!iconHtml && gId) {
                    const domGuildImg = document.querySelector(`[data-list-item-id="guildsnav___${gId}"] img, nav[class*="guilds_"] a[href*="/channels/${gId}/"] img`);
                    if (domGuildImg && domGuildImg.src) {
                        iconHtml = `<img src="${escapeHtmlSafe(domGuildImg.src)}" alt="" style="width:16px;height:16px;border-radius:4px;object-fit:cover;flex-shrink:0;display:block;" />`;
                    } else if (labelText) {
                        const acro = labelText.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
                        iconHtml = `<span style="width:16px;height:16px;border-radius:4px;background:#2b2d31;color:#dbdee1;font-size:9px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${escapeHtmlSafe(acro)}</span>`;
                    }
                }
            } else if (path.startsWith('/shop')) {
                iconHtml = DISCORD_FRIENDS_WAVE_SVG;
                labelText = 'Shop';
            } else if (path.startsWith('/store')) {
                iconHtml = DISCORD_FRIENDS_WAVE_SVG;
                labelText = 'Nitro';
            } else if (path.startsWith('/message-requests')) {
                iconHtml = DISCORD_FRIENDS_WAVE_SVG;
                labelText = 'Message Requests';
            } else {
                iconHtml = DISCORD_FRIENDS_WAVE_SVG;
                labelText = getEffectiveAppName();
            }

            const nextSig = `${iconHtml}|${labelText}`;
            if (nextSig !== lastCenterTitleSig) {
                lastCenterTitleSig = nextSig;
                titleEl.innerHTML = `${iconHtml}<span class="lc-tb-center-title-text">${escapeHtmlSafe(labelText)}</span>`;
            }
        } catch (e) {}
    }

    function updateTitleBarElements() {
        if (!discordTitleBar) return;
        const ramPill = document.getElementById('lc-tb-ram-pill');
        if (ramPill) {
            ramPill.style.display = (cfg.ShowTitleBarRam !== false) ? 'inline-flex' : 'none';
        }
        if (titleBarQuestOnlyBtn) {
            const qServiceInstalled = (cfg.QuestCompleterInstalled !== false) && (cfg.ShowTitleBarQuestBtn !== false);
            titleBarQuestOnlyBtn.style.display = qServiceInstalled ? 'inline-flex' : 'none';
            titleBarQuestOnlyBtn.classList.toggle('active', !!cfg.QuestOnlyModeActive);
            titleBarQuestOnlyBtn.title = cfg.QuestOnlyModeActive
                ? `Switch to Full Discord View (${getShortcutLabel('questOnly')})`
                : `Quest Completer Interface (${getShortcutLabel('questOnly')})`;
        }
        const tbShortcutsBtn = document.getElementById('litecord-tb-shortcuts-btn');
        if (tbShortcutsBtn) {
            tbShortcutsBtn.style.display = (cfg.ShowTitleBarShortcutsBtn !== false) ? 'inline-flex' : 'none';
            const scModal = document.getElementById('lc-shortcuts-modal');
            tbShortcutsBtn.classList.toggle('active', !!(scModal && scModal.style.display === 'flex'));
            tbShortcutsBtn.title = `Keyboard Shortcuts & Remapping (${getShortcutLabel('shortcutsMenu')})`;
        }
        if (titleBarBtn) {
            titleBarBtn.style.display = (cfg.ShowTitleBarConfigBtn !== false) ? 'inline-flex' : 'none';
            titleBarBtn.classList.toggle('active', !!menuOpen);
            titleBarBtn.title = `Configurations (${getShortcutLabel('configMenu')})`;
            const nextIconHtml = getConfiguredTitleBarIconHtml();
            if (titleBarBtn.getAttribute('data-icon-sig') !== nextIconHtml) {
                titleBarBtn.setAttribute('data-icon-sig', nextIconHtml);
                titleBarBtn.innerHTML = nextIconHtml;
            }
        }
        updateTitleBarCenterPageTitle();
    }

    function openPatchNotesModal() {
        if (!document.body) return;
        if (!patchNotesModal || !patchNotesModal.isConnected) {
            patchNotesModal = document.createElement('div');
            patchNotesModal.id = 'lc-patch-notes-modal';
            patchNotesModal.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.65);display:none;align-items:center;justify-content:center;user-select:none;font-family:-apple-system, BlinkMacSystemFont, Segoe UI, Inter, sans-serif;';
            document.body.appendChild(patchNotesModal);
        }
        const appName = getEffectiveAppName();
        patchNotesModal.innerHTML = `
            <div style='width:min(460px, calc(100vw - 24px));max-height:82vh;background:#1e1f22;border:1px solid rgba(255,255,255,0.06);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,0.65);color:#dbdee1;display:flex;flex-direction:column;overflow:hidden;animation:lcModalFadeIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);'>
                <div style='padding:13px 16px;background:#18191c;border-bottom:1px solid rgba(255,255,255,0.045);display:flex;justify-content:space-between;align-items:center;'>
                    <div>
                        <div style='font-size:13.5px;font-weight:600;color:#f2f3f5;'>${escapeHtmlSafe(appName)} — Patch Notes</div>
                        <div style='font-size:11px;color:#80848e;margin-top:2px;'>App v${APP_VERSION_STR}  &bull;  Installer v${INSTALLER_VERSION_STR}  &bull;  Engine ${ENGINE_VERSION_STR}</div>
                    </div>
                    <button id='lc-patch-close-btn' class='lc-menu-close-btn' title='Close'>${MSR.winClose}</button>
                </div>

                <div style='padding:14px 16px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;font-size:12px;line-height:1.5;'>
                    <div style='background:#232428;border-radius:8px;padding:12px 14px;'>
                        <div style='font-size:12.5px;font-weight:600;color:#f2f3f5;margin-bottom:8px;'>DisCRust v0.6.6 (Current) — High-Bitrate Anti-Stutter Stream Engine, Real-Time AudioWorklet, Draggable Combined Stream &amp; Privacy Hub, Rounded Window Corners &amp; Keyboard Shortcuts Remapper</div>
                        <div style='display:flex;flex-direction:column;gap:7px;color:#949ba4;margin-bottom:10px;'>
                            <div><strong style='color:#dbdee1;font-weight:600;'>Per-Program Process-Loopback Audio</strong> — Uses Windows 10/11 <code style='color:#a5b4fc;'>PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE</code> on the selected program&rsquo;s PID so only the streamed application&rsquo;s audio is transmitted (never the whole computer).</div>
                            <div><strong style='color:#dbdee1;font-weight:600;'>Stream Quality Selection Menu Restored</strong> — Full Go-Live Stream Quality menu (720p / 1080p / 1440p / Source @ 15 / 30 / 60 FPS) with live mid-stream quality &amp; audio-target switching.</div>
                            <div><strong style='color:#dbdee1;font-weight:600;'>Separate &ldquo;DisCRust Privacy settings&rdquo; Overlay</strong> — Dedicated floating overlay that appears alongside the stream screen to toggle privacy masks, turns off automatically when the stream ends, and works manually in between streams.</div>
                        </div>
                        <div style='font-size:12px;font-weight:600;color:#f2f3f5;margin-bottom:6px;'>DisCRust v0.6.0 – v0.6.3 Highlights</div>
                        <div style='display:flex;flex-direction:column;gap:7px;color:#949ba4;'>
                            <div><strong style='color:#dbdee1;font-weight:600;'>DisCRust Minimalist Geometric Branding</strong> — Rebranded to DisCRust with a custom minimalist geometric emblem while keeping Custom App Name &amp; Icon configurable.</div>
                            <div><strong style='color:#dbdee1;font-weight:600;'>Go Live Audio &amp; Quality Options</strong> — Restored full Stream Quality options (480p–2160p, 15–120 FPS), background IPolicyConfig audio output unification, and screen-share banner suppression.</div>
                            <div><strong style='color:#dbdee1;font-weight:600;'>WorkArea Maximize, Resize &amp; Title Bar Drag</strong> — Maximizes cleanly to the desktop WorkArea without covering the taskbar or overlapping other apps, with 8-edge resizing and UI scaling.</div>
                            <div><strong style='color:#dbdee1;font-weight:600;'>Quest Tray Position Reset &amp; Picker Filter</strong> — Resets Quest HUD &amp; pill to the bottom-right corner on toggle/maximize while staying draggable, and hides Rainmeter/RzMonitor clutter from screen share.</div>
                        </div>
                    </div>

                    <div style='background:#232428;border-radius:8px;padding:12px 14px;'>
                        <div style='font-size:12.5px;font-weight:600;color:#f2f3f5;margin-bottom:8px;'>Version 0.4.5 – 0.4.7</div>
                        <div style='display:flex;flex-direction:column;gap:7px;color:#949ba4;'>
                            <div><strong style='color:#dbdee1;font-weight:600;'>Window Size Memory</strong> — Remembers window dimensions and maximized state across launches and toasts.</div>
                            <div><strong style='color:#dbdee1;font-weight:600;'>Privacy &amp; Animations</strong> — Grayscale + blur avatar masking, Enable All button, and toggleable UI animations.</div>
                            <div><strong style='color:#dbdee1;font-weight:600;'>Native Windows Toasts</strong> — Circular sender avatars, click-to-chat redirect, and red-dot server badges.</div>
                        </div>
                    </div>
                </div>

                <div style='padding:10px 16px;background:#18191c;border-top:1px solid rgba(255,255,255,0.045);display:flex;justify-content:flex-end;'>
                    <button id='lc-patch-done-btn' class='lc-subtle-btn' style='height:28px;padding:0 14px;color:#dbdee1;'>Close</button>
                </div>
            </div>
        `;
        patchNotesModal.style.display = 'flex';
        patchNotesModal.onclick = (e) => {
            if (e.target === patchNotesModal) patchNotesModal.style.display = 'none';
        };
        document.getElementById('lc-patch-close-btn').onclick = () => { patchNotesModal.style.display = 'none'; };
        document.getElementById('lc-patch-done-btn').onclick = () => { patchNotesModal.style.display = 'none'; };
    }

    function switchMenuTab(tabId) {
        activeMenuTab = tabId;
        for (const btn of document.querySelectorAll('.lc-top-tab-btn')) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        }
        for (const pane of document.querySelectorAll('.lc-menu-pane')) {
            pane.style.display = (pane.id === 'lc-pane-' + tabId) ? 'block' : 'none';
        }
    }

    function createTopDropdownMenu() {
        if (!document.body || !document.head) return;
        injectMaterialSymbolsFont();
        injectGoogleNotoEmojiFont();
        createDiscordAdaptiveTitleBar();
        const existing = document.getElementById('litecord-dropdown-menu');
        if (existing) {
            menuOverlay = existing;
            return;
        }

        if (!document.getElementById('litecord-dropdown-styles')) {
            const menuStyle = document.createElement('style');
            menuStyle.id = 'litecord-dropdown-styles';
            menuStyle.textContent = `
                /* 1. Single Unified Adaptive Title Bar: suppress Discord's internal top bar completely */
                :root, html, body, #app-mount {
                    --custom-app-top-bar-height: 0px !important;
                }
                .vc-notification-root,
                .vc-notification,
                [class*='vc-notification'],
                #lc-toast-container {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    width: 0 !important;
                    height: 0 !important;
                }
                #app-mount {
                    position: fixed !important;
                    top: 38px !important;
                    left: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    height: calc(100vh - 38px) !important;
                }
                nav[class*='guilds_'] ul[class*='tree_'],
                nav[class*='guilds_'] div[class*='scroller_'] {
                    padding-top: 4px !important;
                }
                div[class*='titleBar_'],
                div[class*='typeWindows_'],
                div[class*='withFrame_'],
                div[class*='winButtons_'],
                div[class*='base_'] > div[class*='bar_'],
                div[class*='app_'] > div[class*='bar_'],
                [aria-label='Window Bar'] {
                    display: none !important;
                    height: 0 !important;
                    min-height: 0 !important;
                    max-height: 0 !important;
                    overflow: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    border: none !important;
                }

                /* 2. Custom Adaptive 32px Discord Title Bar (Adapts to Dark, Light, Blue & Gradient Themes) */
                #app-mount,
                #app-mount > div,
                div[class*='base_'],
                div[class*='page_'],
                div[class*='content_'],
                div[class*='sidebar_'],
                div[class*='chat_'],
                section[class*='title_'],
                nav[class*='guilds_'] {
                    border-top: none !important;
                }
                #lc-discord-titlebar {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 39px;
                    z-index: 2147483645;
                    background-color: #000000;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 0 6px 8px;
                    user-select: none;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, 'Noto Color Emoji', sans-serif;
                    border-bottom: none !important;
                    box-shadow: none !important;
                }
                #lc-discord-titlebar.lc-tb-light-mode {
                    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
                }
                #lc-discord-titlebar.lc-tb-light-mode .lc-tb-icon-btn,
                #lc-discord-titlebar.lc-tb-light-mode .lc-tb-win-btn,
                #lc-discord-titlebar.lc-tb-light-mode .lc-tb-ram-btn {
                    color: #313338;
                }
                .lc-tb-left {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    flex-shrink: 0;
                }
                .lc-tb-center {
                    flex: 1;
                    height: 100%;
                    min-width: 40px;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .lc-tb-center-title {
                    position: fixed !important;
                    left: 50vw !important;
                    top: 0 !important;
                    height: 32px !important;
                    transform: translateX(-50%) !important;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 7px;
                    max-width: calc(100vw - 440px);
                    overflow: hidden;
                    pointer-events: none;
                    user-select: none;
                    z-index: 2147483646;
                }
                .lc-tb-center-title-text {
                    font-size: 12.5px;
                    font-weight: 600;
                    color: #dbdee1;
                    letter-spacing: 0.1px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    line-height: 1.2;
                }
                #lc-discord-titlebar.lc-tb-light-mode .lc-tb-center-title-text {
                    color: #313338;
                }
                .lc-tb-right {
                    display: flex;
                    align-items: center;
                    height: 100%;
                    gap: 2px;
                    flex-shrink: 0;
                }
                .lc-tb-ram-btn {
                    display: inline-flex;
                    align-items: center;
                    height: 22px;
                    padding: 0 8px;
                    border-radius: 5px;
                    background: rgba(255, 255, 255, 0.05);
                    border: none;
                    color: #b5bac1;
                    font-size: 11px;
                    font-weight: 500;
                    white-space: nowrap !important;
                    line-height: 1 !important;
                    cursor: pointer;
                    margin-right: 2px;
                }
                .lc-tb-ram-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #f2f3f5;
                }
                .lc-tb-icon-btn {
                    width: 28px;
                    height: 24px;
                    border-radius: 5px;
                    border: none;
                    background: transparent;
                    color: #b5bac1;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    padding: 0;
                    flex-shrink: 0;
                }
                .lc-tb-icon-btn:hover {
                    background: rgba(255, 255, 255, 0.08);
                    color: #f2f3f5;
                }
                .lc-tb-icon-btn.active {
                    background: rgba(88, 101, 242, 0.22);
                    color: #ffffff;
                }
                .lc-tb-icon-btn.disabled {
                    opacity: 0.32;
                    pointer-events: none;
                    cursor: default;
                }
                .lc-tb-divider {
                    width: 1px;
                    height: 14px;
                    background: rgba(255, 255, 255, 0.09);
                    margin: 0 4px;
                    flex-shrink: 0;
                }
                .lc-tb-win-btn {
                    width: 40px;
                    height: 32px;
                    border: none;
                    background: transparent;
                    color: #b5bac1;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    padding: 0;
                    flex-shrink: 0;
                }
                .lc-tb-win-btn:hover {
                    background: rgba(255, 255, 255, 0.08);
                    color: #ffffff;
                }
                .lc-tb-win-close:hover {
                    background: #da373c !important;
                    color: #ffffff !important;
                }

                /* 3. Subtle Eye-Pleasing UI Animations + Responsive Small-Window Layout (v0.6.6) */
                @keyframes lcMenuPopIn {
                    0% { opacity: 0; transform: translateY(-7px) scale(0.982); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes lcPaneFadeIn {
                    0% { opacity: 0; transform: translateY(4px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                @keyframes lcModalFadeIn {
                    0% { opacity: 0; transform: scale(0.96); }
                    100% { opacity: 1; transform: scale(1); }
                }
                #litecord-dropdown-menu, #litecord-dropdown-menu *,
                #litecord-quest-hud, #litecord-quest-hud *,
                #lc-discord-titlebar, #lc-discord-titlebar *,
                #lc-patch-notes-modal, #lc-patch-notes-modal *,
                #lc-confirm-action-modal, #lc-confirm-action-modal * {
                    box-sizing: border-box !important;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255,255,255,0.12) transparent;
                }
                .lc-tb-icon-btn svg, .lc-tb-win-btn svg, .lc-menu-close-btn svg, .lc-top-tab-btn svg {
                    pointer-events: none !important;
                }
                .lc-tb-icon-btn, .lc-tb-win-btn, .lc-tb-ram-btn, .lc-menu-close-btn,
                .lc-top-tab-btn, .lc-dd-item, .lc-primary-btn, .lc-subtle-btn, .lc-seg-btn,
                .lc-q-rate-btn, .lc-q-hud-fchip {
                    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.12s ease, opacity 0.15s ease;
                }
                .lc-primary-btn:active, .lc-subtle-btn:active, .lc-tb-icon-btn:active, .lc-seg-btn:active {
                    transform: scale(0.96);
                }
                .lc-dd-switch {
                    transition: background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1) !important;
                }
                .lc-dd-switch::after {
                    transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.18s ease !important;
                }
                .lc-menu-pane {
                    animation: lcPaneFadeIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);
                }
                #litecord-dropdown-menu {
                    position: fixed;
                    top: 42px;
                    right: 12px;
                    width: min(492px, calc(100vw - 20px));
                    max-width: calc(100vw - 16px);
                    max-height: calc(100vh - 50px);
                    z-index: 2147483647;
                    background: #1e1f22;
                    border: 1px solid rgba(255, 255, 255, 0.07);
                    border-radius: 12px;
                    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
                    color: #dbdee1;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, 'Noto Color Emoji', sans-serif;
                    display: none;
                    flex-direction: column;
                    user-select: none;
                    overflow: hidden;
                    animation: lcMenuPopIn 0.17s cubic-bezier(0.16, 1, 0.3, 1);
                }
                body.lc-no-animations #litecord-dropdown-menu,
                body.lc-no-animations #litecord-dropdown-menu *,
                body.lc-no-animations #litecord-quest-hud,
                body.lc-no-animations #litecord-quest-hud *,
                body.lc-no-animations #lc-discord-titlebar,
                body.lc-no-animations #lc-discord-titlebar *,
                body.lc-no-animations #lc-patch-notes-modal,
                body.lc-no-animations #lc-patch-notes-modal *,
                body.lc-no-animations #lc-confirm-action-modal,
                body.lc-no-animations #lc-confirm-action-modal * {
                    transition: none !important;
                    animation: none !important;
                }
                .lc-menu-hdr {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 11px 14px;
                    background: #18191c;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.045);
                    cursor: grab;
                }
                .lc-menu-close-btn {
                    width: 26px;
                    height: 26px;
                    border-radius: 6px;
                    border: none;
                    background: transparent;
                    color: #949ba4;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    padding: 0;
                    flex-shrink: 0;
                }
                .lc-menu-close-btn:hover {
                    background: rgba(255, 255, 255, 0.08);
                    color: #f2f3f5;
                }
                .lc-top-tabs {
                    display: grid;
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 6px;
                    padding: 8px 14px;
                    background: #18191c;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.045);
                }
                .lc-top-tab-btn {
                    height: 34px;
                    border-radius: 7px;
                    border: none;
                    background: transparent;
                    color: #949ba4;
                    font-size: 12px;
                    font-weight: 600;
                    line-height: 1 !important;
                    white-space: nowrap !important;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    cursor: pointer;
                    padding: 0 10px;
                    overflow: hidden;
                }
                .lc-top-tab-btn:hover {
                    background: rgba(255, 255, 255, 0.04);
                    color: #dbdee1;
                }
                .lc-top-tab-btn.active {
                    background: #2b2d31;
                    color: #f2f3f5;
                }
                .lc-top-tab-btn svg {
                    width: 15px;
                    height: 15px;
                    flex-shrink: 0;
                    opacity: 0.85;
                }
                .lc-menu-content-col {
                    padding: 14px;
                    max-height: calc(100vh - 148px);
                    overflow-y: auto;
                    flex: 1;
                    min-height: 0;
                }
                .lc-dd-cat {
                    font-size: 10.5px;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    color: #80848e;
                    text-transform: uppercase;
                    padding: 0 2px 6px 2px;
                    line-height: 1.2;
                }
                .lc-group-card {
                    background: #26282d;
                    border: 1px solid rgba(255, 255, 255, 0.045);
                    border-radius: 9px;
                    overflow: hidden;
                    margin-bottom: 12px;
                }
                .lc-dd-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 9px 13px;
                    background: transparent;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.038);
                    cursor: pointer;
                    gap: 12px;
                }
                .lc-dd-item:last-child {
                    border-bottom: none;
                }
                .lc-dd-item:hover {
                    background: rgba(255, 255, 255, 0.025);
                }
                .lc-dd-left {
                    display: flex;
                    align-items: center;
                    gap: 11px;
                    min-width: 0;
                    flex: 1;
                }
                .lc-dd-icon {
                    width: 20px;
                    height: 20px;
                    color: #949ba4;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .lc-dd-icon svg {
                    width: 18px;
                    height: 18px;
                    flex-shrink: 0;
                }
                .lc-dd-text {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 0;
                    flex: 1;
                }
                .lc-dd-label {
                    font-size: 12.5px;
                    font-weight: 500;
                    line-height: 1.28;
                    color: #dbdee1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .lc-dd-desc {
                    font-size: 11px;
                    font-weight: 400;
                    line-height: 1.3;
                    color: #80848e;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .lc-dd-switch {
                    width: 34px;
                    height: 19px;
                    border-radius: 999px;
                    background: #3f4147;
                    position: relative;
                    flex-shrink: 0;
                    cursor: pointer;
                }
                .lc-dd-switch::after {
                    content: '';
                    position: absolute;
                    top: 2.5px;
                    left: 2.5px;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: #d1d5db;
                }
                .lc-dd-switch.active {
                    background: #5865f2;
                }
                .lc-dd-switch.active::after {
                    left: 17.5px;
                    background: #ffffff;
                }
                .lc-seg-group {
                    display: inline-flex;
                    gap: 3px;
                    background: #18191c;
                    padding: 3px;
                    border-radius: 7px;
                    flex-shrink: 0;
                }
                .lc-seg-btn {
                    background: transparent;
                    color: #949ba4;
                    border: none;
                    border-radius: 5px;
                    padding: 5px 8px;
                    font-size: 11px;
                    font-weight: 500;
                    line-height: 1 !important;
                    white-space: nowrap !important;
                    cursor: pointer;
                    flex-shrink: 0;
                }
                .lc-seg-btn:hover {
                    color: #dbdee1;
                }
                .lc-seg-btn.active {
                    background: #313338;
                    color: #f2f3f5;
                    font-weight: 600;
                }
                .lc-subtle-btn {
                    background: #313338;
                    color: #dbdee1;
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 6px;
                    height: 27px;
                    padding: 0 10px;
                    font-size: 11.5px;
                    font-weight: 500;
                    line-height: 1 !important;
                    white-space: nowrap !important;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    flex-shrink: 0 !important;
                }
                .lc-subtle-btn:hover {
                    background: #383a40;
                    color: #f2f3f5;
                }
                .lc-primary-btn {
                    background: #5865f2;
                    color: #ffffff;
                    border: none;
                    border-radius: 6px;
                    height: 27px;
                    padding: 0 11px;
                    font-size: 11.5px;
                    font-weight: 600;
                    line-height: 1 !important;
                    white-space: nowrap !important;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    flex-shrink: 0 !important;
                }
                .lc-primary-btn:hover {
                    background: #4752c4;
                }
                .lc-text-input {
                    background: #18191c;
                    color: #f2f3f5;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 6px;
                    height: 27px;
                    padding: 0 8px;
                    font-size: 12px;
                    width: 128px;
                    outline: none;
                }
                .lc-text-input:focus {
                    border-color: #5865f2;
                }
                #lc-quest-expanded-card {
                    width: 348px;
                    background: #1e1f22;
                    border: 1px solid rgba(255, 255, 255, 0.07);
                    border-radius: 11px;
                    padding: 12px 14px;
                    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, 'Noto Color Emoji', sans-serif;
                    color: #dbdee1;
                }
                #lc-quest-fab-pill {
                    display: none;
                    align-items: center;
                    gap: 8px;
                    padding: 7px 13px;
                    background: #1e1f22;
                    border: 1px solid rgba(255,255,255,0.09);
                    border-radius: 999px;
                    box-shadow: 0 8px 22px rgba(0,0,0,0.5);
                    cursor: pointer;
                }
                .lc-q-rate-btn, .lc-q-hud-fchip {
                    background: transparent;
                    color: #80848e;
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 5px;
                    padding: 3px 7px;
                    font-size: 10.5px;
                    font-weight: 500;
                    line-height: 1 !important;
                    white-space: nowrap !important;
                    cursor: pointer;
                }
                .lc-q-rate-btn.active, .lc-q-hud-fchip.active {
                    background: #2b2d31;
                    color: #dbdee1;
                    border-color: rgba(255,255,255,0.12);
                }
            `;
            document.head.appendChild(menuStyle);
        }

        const appName = getEffectiveAppName();
        activeMenuTab = 'quests';
        menuOverlay = document.createElement('div');
        menuOverlay.id = 'litecord-dropdown-menu';
        menuOverlay.innerHTML = `
            <div id='lc-menu-drag-header' class='lc-menu-hdr' title='Drag to reposition Configurations window'>
                <div style='display:flex;align-items:center;gap:8px;'>
                    <span style='color:#e8e6e1;display:flex;'>${DISCRUST_EMBLEM_SVG}</span>
                    <strong id='lc-menu-hdr-appname' style='color:#f2f3f5;font-size:13.5px;font-weight:600;line-height:1;'>${escapeHtmlSafe(appName)} Configurations</strong>
                    <button id='lc-hdr-ver-pill' title='Click to view Patch Notes' style='font-size:10.5px;color:#a5b4fc;background:rgba(88,101,242,0.16);border:1px solid rgba(88,101,242,0.28);padding:2px 7px;border-radius:4px;font-weight:600;line-height:1;cursor:pointer;'>v0.6.6</button>
                </div>
                <div style='display:flex;align-items:center;gap:6px;'>
                    <span id='lc-hdr-ram-badge' style='font-size:11px;color:#949ba4;background:#26282d;padding:3px 7px;border-radius:4px;font-weight:500;line-height:1;white-space:nowrap;'>-- MB</span>
                    <button id='lc-menu-close-btn' class='lc-menu-close-btn' title='Close Configurations (Esc)'>${MSR.winClose}</button>
                </div>
            </div>
            <div class='lc-top-tabs'>
                <button class='lc-top-tab-btn active' data-tab='quests'>${MSR.target}<span>Quests</span></button>
                <button class='lc-top-tab-btn' data-tab='ui'>${MSR.desktop}<span>Workspace</span></button>
                <button class='lc-top-tab-btn' data-tab='privacy'>${MSR.shield}<span>Privacy</span></button>
                <button class='lc-top-tab-btn' data-tab='system'>${MSR.memory}<span>System</span></button>
            </div>
            <div class='lc-menu-content-col'>
                <!-- TAB 1: Quests -->
                <div class='lc-menu-pane' id='lc-pane-quests' style='display:block;'>
                    <div class='lc-dd-cat'>Quest Queue</div>
                    <div class='lc-group-card'>
                        <div class='lc-dd-item' style='cursor:default;'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.play}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Quest Completer Queue</div>
                                    <div class='lc-dd-desc'>Auto-batches 2–5 quests with 15–60s inter-quest &amp; 1–4m batch delays</div>
                                </div>
                            </div>
                            <button id='lc-q-cfg-scanstart' class='lc-primary-btn'>
                                ${MSR.play}<span>Scan &amp; Start</span>
                            </button>
                        </div>
                    </div>

                    <div class='lc-dd-cat'>Quest Automation</div>
                    <div class='lc-group-card' style='margin-bottom:0;'>
                        <div class='lc-dd-item' id='dd-row-quest'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.target}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Floating Quest Panel</div>
                                    <div class='lc-dd-desc'>Show draggable Quest HUD inside Full Discord</div>
                                </div>
                            </div>
                            <div id='lc-sw-quest' class='lc-dd-switch'></div>
                        </div>
                        <div class='lc-dd-item' id='lc-q-row-autostart'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.bolt}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Auto-Complete Quests</div>
                                    <div class='lc-dd-desc'>Automatically enroll and complete discovered quests</div>
                                </div>
                            </div>
                            <div id='lc-sw-q-autostart' class='lc-dd-switch'></div>
                        </div>
                        <div class='lc-dd-item' id='lc-q-row-autoscan'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.restart}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Auto-Scan on Launch</div>
                                    <div class='lc-dd-desc'>Scan for available quests automatically at startup</div>
                                </div>
                            </div>
                            <div id='lc-sw-q-autoscan' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='lc-q-row-desktop-default'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.desktop}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Desktop Tasks First</div>
                                    <div class='lc-dd-desc'>Prioritize Desktop game and video quests over Console</div>
                                </div>
                            </div>
                            <div id='lc-sw-q-desktop-default' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='lc-q-row-autofab'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.pin}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Auto-Minimize HUD</div>
                                    <div class='lc-dd-desc'>Collapse floating Quest box to corner pill when active</div>
                                </div>
                            </div>
                            <div id='lc-sw-q-autofab' class='lc-dd-switch'></div>
                        </div>
                    </div>
                </div>

                <!-- TAB 2: Workspace, Custom Icon/Name, Shortcuts & Notifications -->
                <div class='lc-menu-pane' id='lc-pane-ui' style='display:none;'>
                    <div class='lc-dd-cat'>Workspace &amp; Startup</div>
                    <div class='lc-group-card'>
                        <div class='lc-dd-item' id='dd-row-switch-workspace'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.swap}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label' id='lc-misc-workspace-lbl'>Switch to Quests Only UI</div>
                                    <div class='lc-dd-desc'>Toggle between Full Discord and Quests Only mode</div>
                                </div>
                            </div>
                            <span class='lc-subtle-btn' style='pointer-events:none;'>Switch</span>
                        </div>
                        <div class='lc-dd-item' style='cursor:default;'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.desktop}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Startup Mode</div>
                                    <div class='lc-dd-desc'>Default view on launch</div>
                                </div>
                            </div>
                            <div class='lc-seg-group'>
                                <button class='lc-launch-mode-btn lc-seg-btn' data-lmode='Ask'>Ask</button>
                                <button class='lc-launch-mode-btn lc-seg-btn' data-lmode='Discord'>Discord</button>
                                <button class='lc-launch-mode-btn lc-seg-btn' data-lmode='QuestOnly'>Quests</button>
                            </div>
                        </div>
                    </div>

                    <div class='lc-dd-cat'>Custom App Name &amp; Icon</div>
                    <div class='lc-group-card'>
                        <div class='lc-dd-item' style='cursor:default;'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.tag}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Custom App Name</div>
                                    <div class='lc-dd-desc'>Window &amp; shortcut title</div>
                                </div>
                            </div>
                            <div style='display:flex;align-items:center;gap:5px;flex-shrink:0;'>
                                <input id='lc-custom-name-input' class='lc-text-input' type='text' maxlength='28' placeholder='DisCRust' value='${appName}' />
                                <button id='lc-custom-name-save' class='lc-primary-btn'>Save</button>
                                <button id='lc-custom-name-reset' class='lc-subtle-btn'>Reset</button>
                            </div>
                        </div>
                        <div class='lc-dd-item' style='cursor:default;'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon' id='lc-custom-icon-preview'>${MSR.image}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Custom App Icon</div>
                                    <div class='lc-dd-desc' id='lc-custom-icon-status'>Apply .ico or .png to window, tray &amp; shortcuts</div>
                                </div>
                            </div>
                            <div style='display:flex;align-items:center;gap:5px;flex-shrink:0;'>
                                <button id='lc-custom-icon-browse' class='lc-subtle-btn'>Choose Icon</button>
                                <button id='lc-custom-icon-reset' class='lc-subtle-btn'>Reset</button>
                            </div>
                        </div>
                        <div class='lc-dd-item' style='cursor:default;'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.tune}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Title Bar Icon Style</div>
                                    <div class='lc-dd-desc'>Icon for the top-right Configurations button</div>
                                </div>
                            </div>
                            <div class='lc-seg-group'>
                                <button class='lc-icon-style-btn lc-seg-btn' data-istyle='Sliders'>Sliders</button>
                                <button class='lc-icon-style-btn lc-seg-btn' data-istyle='Gear'>Gear</button>
                                <button class='lc-icon-style-btn lc-seg-btn' data-istyle='Bolt'>Bolt</button>
                                <button class='lc-icon-style-btn lc-seg-btn' data-istyle='Custom'>Custom</button>
                            </div>
                        </div>
                    </div>

                    <div class='lc-dd-cat'>Shortcuts &amp; Notifications</div>
                    <div class='lc-group-card'>
                        <div class='lc-dd-item' id='dd-row-notifications'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.bolt}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Desktop Notifications</div>
                                    <div class='lc-dd-desc'>Avatar, Google Emojis, Click-to-Chat &amp; DND aware</div>
                                </div>
                            </div>
                            <div style='display:flex;align-items:center;gap:8px;flex-shrink:0;'>
                                <button id='lc-btn-test-notif' class='lc-subtle-btn'>Test</button>
                                <div id='lc-sw-notifications' class='lc-dd-switch active'></div>
                            </div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-desktop-shortcut'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.desktop}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Desktop Shortcut</div>
                                    <div class='lc-dd-desc'>Create isolated shortcut on your Desktop</div>
                                </div>
                            </div>
                            <div id='lc-sw-desktop-shortcut' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-startmenu-shortcut'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.pin}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Pin to Start Menu</div>
                                    <div class='lc-dd-desc'>Create and pin shortcut in Windows Start Menu</div>
                                </div>
                            </div>
                            <div id='lc-sw-startmenu-shortcut' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-win-startup'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.restart}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Run on Windows Startup</div>
                                    <div class='lc-dd-desc'>Launch automatically when signing into Windows</div>
                                </div>
                            </div>
                            <div id='lc-sw-win-startup' class='lc-dd-switch'></div>
                        </div>
                    </div>

                    <div class='lc-dd-cat'>Appearance &amp; Title Bar Icons</div>
                    <div class='lc-group-card' style='margin-bottom:0;'>
                        <div class='lc-dd-item' style='cursor:default;'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.palette}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Interface Scale</div>
                                    <div class='lc-dd-desc'>Adjust UI zoom (click percentage to reset)</div>
                                </div>
                            </div>
                            <div style='display:flex;align-items:center;gap:4px;flex-shrink:0;'>
                                <button id='lc-ui-scale-minus' class='lc-subtle-btn' style='width:27px;padding:0;'>−</button>
                                <span id='lc-ui-scale-lbl' style='min-width:44px;text-align:center;font-size:12px;font-weight:600;color:#dbdee1;cursor:pointer;'>100%</span>
                                <button id='lc-ui-scale-plus' class='lc-subtle-btn' style='width:27px;padding:0;'>+</button>
                            </div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-titlebar-quest-btn'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.target}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Quests Only Interface Icon</div>
                                    <div class='lc-dd-desc'>Show on title bar (or launch directly here when off)</div>
                                </div>
                            </div>
                            <div style='display:flex;align-items:center;gap:8px;flex-shrink:0;'>
                                <button id='lc-btn-cfg-open-questonly' class='lc-subtle-btn'>Open Quests UI</button>
                                <div id='lc-sw-titlebar-quest-btn' class='lc-dd-switch active'></div>
                            </div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-titlebar-shortcuts-btn'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.keyboard}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Keyboard Shortcuts Icon</div>
                                    <div class='lc-dd-desc'>Show on title bar (or configure shortcuts here when off)</div>
                                </div>
                            </div>
                            <div style='display:flex;align-items:center;gap:8px;flex-shrink:0;'>
                                <button id='lc-btn-cfg-open-shortcuts' class='lc-primary-btn'>Shortcuts Menu</button>
                                <div id='lc-sw-titlebar-shortcuts-btn' class='lc-dd-switch active'></div>
                            </div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-titlebar-btn'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.tune}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Title Bar Settings Icon</div>
                                    <div class='lc-dd-desc'>Show Configurations button on the top bar</div>
                                </div>
                            </div>
                            <div id='lc-sw-titlebar-btn' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-titlebar-pagetitle'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.desktop}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Show Titles on Title Bar</div>
                                    <div class='lc-dd-desc'>Display Friends, DM, or Server icon and name in the center of the title bar</div>
                                </div>
                            </div>
                            <div id='lc-sw-titlebar-pagetitle' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-titlebar-ram'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.memory}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Title Bar Memory Readout</div>
                                    <div class='lc-dd-desc'>Show live RAM usage on the top bar</div>
                                </div>
                            </div>
                            <div id='lc-sw-titlebar-ram' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-reducemotion'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.bolt}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Subtle UI Animations</div>
                                    <div class='lc-dd-desc'>Smooth fade, pop-in, and switch animations across the interface</div>
                                </div>
                            </div>
                            <div id='lc-sw-reducemotion' class='lc-dd-switch active'></div>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: Privacy, Game Activity & Extensions -->
                <div class='lc-menu-pane' id='lc-pane-privacy' style='display:none;'>
                    <div class='lc-dd-cat'>Activity, Extensions &amp; Voice</div>
                    <div class='lc-group-card'>
                        <div class='lc-dd-item' id='dd-row-game-activity'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.desktop}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Real Game Activity Detection</div>
                                    <div class='lc-dd-desc'>Detect running games via official Discord catalog</div>
                                </div>
                            </div>
                            <div id='lc-sw-game-activity' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-vencord'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.extension}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Vencord Extension</div>
                                    <div class='lc-dd-desc'>Enable built-in Vencord plugins and custom themes</div>
                                </div>
                            </div>
                            <div id='lc-sw-vencord' class='lc-dd-switch'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-krisp'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.bolt}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Krisp Voice Noise Suppression</div>
                                    <div class='lc-dd-desc'>Enable desktop Chrome WebAssembly Krisp audio</div>
                                </div>
                            </div>
                            <div id='lc-sw-krisp' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-userscripts'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.tune}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Custom Userscripts</div>
                                    <div class='lc-dd-desc'>Open folder to auto-inject custom .js scripts</div>
                                </div>
                            </div>
                            <span class='lc-subtle-btn'>Open Folder</span>
                        </div>
                    </div>

                    <div class='lc-dd-cat' style='display:flex;justify-content:space-between;align-items:center;'>
                        <span>Chat Privacy Masking</span>
                        <button id='lc-btn-priv-enable-all' class='lc-primary-btn' style='height:22px;padding:0 9px;font-size:10.5px;'>Enable All</button>
                    </div>
                    <div class='lc-group-card' style='margin-bottom:0;'>
                        <div class='lc-dd-item' id='dd-row-priv-name'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.shield}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Mask Display Names</div>
                                    <div class='lc-dd-desc'>Hide author display names in chat</div>
                                </div>
                            </div>
                            <div id='lc-sw-priv-name' class='lc-dd-switch'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-priv-userid'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.tag}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Mask Usernames &amp; Tags</div>
                                    <div class='lc-dd-desc'>Hide @mentions, clan tags, and badges</div>
                                </div>
                            </div>
                            <div id='lc-sw-priv-userid' class='lc-dd-switch'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-priv-profile'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.image}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Mask Chat Avatars</div>
                                    <div class='lc-dd-desc'>Hide user profile pictures in chat messages</div>
                                </div>
                            </div>
                            <div id='lc-sw-priv-profile' class='lc-dd-switch'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-priv-overlay'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.shield}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>DisCRust Privacy settings Overlay</div>
                                    <div class='lc-dd-desc'>Open floating privacy overlay (auto-off after stream, manual anytime)</div>
                                </div>
                            </div>
                            <span id='lc-btn-open-priv-overlay' class='lc-subtle-btn'>Toggle Overlay</span>
                        </div>
                    </div>
                </div>

                <!-- TAB 4: System, Optional Services, Updates, Metadata & Patch Notes -->
                <div class='lc-menu-pane' id='lc-pane-system' style='display:none;'>
                    <div class='lc-dd-cat'>Optional Services</div>
                    <div class='lc-group-card'>
                        <div class='lc-dd-item' id='dd-row-opt-quest-service'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.target}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Quest Completer Service</div>
                                    <div class='lc-dd-desc'>Enable Quest Completer HUD &amp; Quests Only workspace</div>
                                </div>
                            </div>
                            <div id='lc-sw-opt-quest-service' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-opt-vencord-service'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.extension}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Vencord Service</div>
                                    <div class='lc-dd-desc'>Install &amp; inject Vencord bundle on startup</div>
                                </div>
                            </div>
                            <div id='lc-sw-opt-vencord-service' class='lc-dd-switch active'></div>
                        </div>
                    </div>

                    <div class='lc-dd-cat'>Memory &amp; Efficiency</div>
                    <div class='lc-group-card'>
                        <div class='lc-dd-item' id='dd-row-autotrim'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.memory}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Auto-Free Memory</div>
                                    <div class='lc-dd-desc'>Compact WebView2 working sets every 12 seconds</div>
                                </div>
                            </div>
                            <div id='lc-sw-autotrim' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-eco'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.eco}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Background Saver</div>
                                    <div class='lc-dd-desc'>Pause non-essential rendering when unfocused</div>
                                </div>
                            </div>
                            <div id='lc-sw-eco' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-trimnow'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.bolt}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Clean Memory Now</div>
                                    <div class='lc-dd-desc'>Active footprint: <span id='lc-menu-ram' style='color:#dbdee1;font-weight:600;'>-- MB</span></div>
                                </div>
                            </div>
                            <span class='lc-subtle-btn'>Clean</span>
                        </div>
                    </div>

                    <div class='lc-dd-cat'>Updates, Metadata &amp; Patch Notes</div>
                    <div class='lc-group-card' style='margin-bottom:10px;'>
                        <div class='lc-dd-item' id='dd-row-autoupdate-all'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.restart}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Automatic Component Updates</div>
                                    <div class='lc-dd-desc'>Keep Quest Completer and Vencord synced automatically</div>
                                </div>
                            </div>
                            <div id='lc-sw-autoupdate-all' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' id='lc-q-row-autoupdate'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.target}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>Sync Quest Task Definitions</div>
                                    <div class='lc-dd-desc'>Update quest heartbeat schemas automatically</div>
                                </div>
                            </div>
                            <div id='lc-sw-q-autoupdate' class='lc-dd-switch active'></div>
                        </div>
                        <div class='lc-dd-item' style='cursor:default;'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.extension}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label'>OTA Update Channel URL</div>
                                    <div class='lc-dd-desc'>Direct OTA manifest URL for pushing updates to users</div>
                                </div>
                            </div>
                            <div style='display:flex;align-items:center;gap:5px;flex-shrink:0;'>
                                <input id='lc-ota-url-input' class='lc-text-input' style='width:168px;font-size:11px;' type='text' placeholder='https://.../ota_manifest.json' value='${escapeHtmlSafe(cfg.OtaManifestUrl || "https://raw.githubusercontent.com/VoxMortis/DisCRust/main/ota_manifest.json")}' />
                                <button id='lc-ota-url-save' class='lc-subtle-btn'>Save</button>
                            </div>
                        </div>
                        <div class='lc-dd-item' id='dd-row-check-updates' style='cursor:default;'>
                            <div class='lc-dd-left'>
                                <span class='lc-dd-icon'>${MSR.bolt}</span>
                                <div class='lc-dd-text'>
                                    <div class='lc-dd-label' id='lc-meta-version-title'>App v0.6.6 • Installer v6.6.0</div>
                                    <div class='lc-dd-desc' id='lc-upd-status-lbl'>Engine 0.6.6-rust • Direct OTA Ready</div>
                                </div>
                            </div>
                            <div style='display:flex;align-items:center;gap:5px;flex-shrink:0;'>
                                <button id='lc-btn-patch-notes' class='lc-subtle-btn'>Patch Notes</button>
                                <button id='lc-btn-update-all-now' class='lc-primary-btn'>Check OTA</button>
                            </div>
                        </div>
                    </div>

                    <div style='display:grid;grid-template-columns:1fr 1fr;gap:8px;'>
                        <button id='dd-row-restart' class='lc-subtle-btn' style='height:32px;width:100%;color:#dbdee1;'>
                            ${MSR.restart}<span>Restart</span>
                        </button>
                        <button id='dd-row-exit' class='lc-subtle-btn' style='height:32px;width:100%;color:#dbdee1;'>
                            ${MSR.exit}<span>Quit</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(menuOverlay);
        menuOverlay.addEventListener('click', (e) => e.stopPropagation());

        document.getElementById('lc-menu-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            menuOpen = false;
            menuOverlay.style.display = 'none';
            updateTitleBarElements();
        });

        document.getElementById('lc-hdr-ver-pill').addEventListener('click', (e) => {
            e.stopPropagation();
            openPatchNotesModal();
        });
        document.getElementById('lc-btn-patch-notes').addEventListener('click', (e) => {
            e.stopPropagation();
            openPatchNotesModal();
        });

        for (const btn of menuOverlay.querySelectorAll('.lc-top-tab-btn')) {
            btn.addEventListener('click', () => switchMenuTab(btn.getAttribute('data-tab') || 'quests'));
        }
        makeElementDraggable(menuOverlay, document.getElementById('lc-menu-drag-header'), null, null);

        document.getElementById('dd-row-titlebar-pagetitle').addEventListener('click', () => {
            cfg.ShowTitleBarPageTitle = (cfg.ShowTitleBarPageTitle === false) ? true : false;
            syncMenuSwitches();
            sendHost('TOGGLE_TITLEBAR_PAGETITLE');
        });
        document.getElementById('dd-row-titlebar-ram').addEventListener('click', () => sendHost('TOGGLE_TITLEBAR_RAM'));
        document.getElementById('dd-row-reducemotion').addEventListener('click', () => {
            cfg.ReduceMotionEnabled = !cfg.ReduceMotionEnabled;
            syncMenuSwitches();
            sendHost('TOGGLE_REDUCE_MOTION');
        });
        document.getElementById('dd-row-eco').addEventListener('click', () => sendHost('TOGGLE_ECO'));
        document.getElementById('dd-row-autotrim').addEventListener('click', () => sendHost('TOGGLE_AUTO_TRIM'));
        document.getElementById('dd-row-trimnow').addEventListener('click', () => sendHost('TRIM_MEMORY'));
        document.getElementById('dd-row-titlebar-btn').addEventListener('click', () => {
            cfg.ShowTitleBarConfigBtn = (cfg.ShowTitleBarConfigBtn === false);
            syncMenuSwitches();
            sendHost('TOGGLE_TITLEBAR_BTN');
        });
        document.getElementById('dd-row-titlebar-quest-btn').addEventListener('click', () => {
            cfg.ShowTitleBarQuestBtn = (cfg.ShowTitleBarQuestBtn === false);
            syncMenuSwitches();
            sendHost('TOGGLE_TITLEBAR_QUEST_BTN');
        });
        document.getElementById('lc-btn-cfg-open-questonly').addEventListener('click', (e) => {
            e.stopPropagation();
            menuOpen = false;
            menuOverlay.style.display = 'none';
            if (window.__lcSetQuestOnlyMode) window.__lcSetQuestOnlyMode(!cfg.QuestOnlyModeActive, true);
            updateTitleBarElements();
        });
        document.getElementById('dd-row-titlebar-shortcuts-btn').addEventListener('click', () => {
            cfg.ShowTitleBarShortcutsBtn = (cfg.ShowTitleBarShortcutsBtn === false);
            syncMenuSwitches();
            sendHost('TOGGLE_TITLEBAR_SHORTCUTS_BTN');
        });
        document.getElementById('lc-btn-cfg-open-shortcuts').addEventListener('click', (e) => {
            e.stopPropagation();
            menuOpen = false;
            menuOverlay.style.display = 'none';
            updateTitleBarElements();
            openKeyboardShortcutsModal();
        });
        document.getElementById('lc-ui-scale-minus').addEventListener('click', () => sendHost('SET_UI_SCALE_STEP:' + Math.max(-10, (cfg.DiscordUiScaleStep || 0) - 1)));
        document.getElementById('lc-ui-scale-plus').addEventListener('click', () => sendHost('SET_UI_SCALE_STEP:' + Math.min(10, (cfg.DiscordUiScaleStep || 0) + 1)));
        document.getElementById('lc-ui-scale-lbl').addEventListener('click', () => sendHost('SET_UI_SCALE_STEP:0'));

        const nameInput = document.getElementById('lc-custom-name-input');
        document.getElementById('lc-custom-name-save').addEventListener('click', (e) => {
            e.stopPropagation();
            const val = (nameInput && nameInput.value ? nameInput.value.trim() : '') || 'DisCRust';
            cfg.CustomAppName = val;
            sendHost('SET_CUSTOM_NAME:' + val);
            syncMenuSwitches();
        });
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = (nameInput.value ? nameInput.value.trim() : '') || 'DisCRust';
                cfg.CustomAppName = val;
                sendHost('SET_CUSTOM_NAME:' + val);
                syncMenuSwitches();
            }
        });
        document.getElementById('lc-custom-name-reset').addEventListener('click', (e) => {
            e.stopPropagation();
            cfg.CustomAppName = 'DisCRust';
            if (nameInput) nameInput.value = 'DisCRust';
            sendHost('SET_CUSTOM_NAME:DisCRust');
            syncMenuSwitches();
        });

        document.getElementById('lc-custom-icon-browse').addEventListener('click', (e) => {
            e.stopPropagation();
            sendHost('BROWSE_CUSTOM_ICON');
        });
        document.getElementById('lc-custom-icon-reset').addEventListener('click', (e) => {
            e.stopPropagation();
            sendHost('RESET_CUSTOM_ICON');
        });

        for (const isBtn of menuOverlay.querySelectorAll('.lc-icon-style-btn')) {
            isBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const st = isBtn.getAttribute('data-istyle') || 'Sliders';
                cfg.ConfigIconStyle = st;
                syncMenuSwitches();
                sendHost('SET_CONFIG_ICON_STYLE:' + st);
            });
        }

        document.getElementById('dd-row-notifications').addEventListener('click', () => sendHost('TOGGLE_NOTIFICATIONS'));
        document.getElementById('lc-btn-test-notif').addEventListener('click', (e) => {
            e.stopPropagation();
            showRichInteractiveToast({
                title: 'DisCRust Support (@discrust)',
                subtitle: '#announcements • DisCRust Official',
                body: 'Rich toasts with Google Noto Color Emoji 🚀✨🔥 and click-to-chat are active!',
                icon: cfg.AppIconPreviewDataUri || 'https://cdn.discordapp.com/embed/avatars/0.png',
                route: '/channels/@me'
            });
        });
        document.getElementById('dd-row-desktop-shortcut').addEventListener('click', () => sendHost('TOGGLE_DESKTOP_SHORTCUT'));
        document.getElementById('dd-row-startmenu-shortcut').addEventListener('click', () => sendHost('TOGGLE_STARTMENU_SHORTCUT'));
        document.getElementById('dd-row-win-startup').addEventListener('click', () => sendHost('TOGGLE_WINDOWS_STARTUP'));

        document.getElementById('dd-row-game-activity').addEventListener('click', () => sendHost('TOGGLE_GAME_ACTIVITY'));
        document.getElementById('dd-row-opt-quest-service').addEventListener('click', () => sendHost('TOGGLE_QUEST_SERVICE_INSTALLED'));
        document.getElementById('dd-row-opt-vencord-service').addEventListener('click', () => sendHost('TOGGLE_VENCORD_SERVICE_INSTALLED'));

        document.getElementById('dd-row-priv-name').addEventListener('click', () => {
            cfg.PrivacyHideName = !cfg.PrivacyHideName;
            syncMenuSwitches();
            sendHost('TOGGLE_PRIVACY_NAME');
        });
        document.getElementById('dd-row-priv-userid').addEventListener('click', () => {
            cfg.PrivacyHideUserId = !cfg.PrivacyHideUserId;
            syncMenuSwitches();
            sendHost('TOGGLE_PRIVACY_USERID');
        });
        document.getElementById('dd-row-priv-profile').addEventListener('click', () => {
            cfg.PrivacyHideProfile = !cfg.PrivacyHideProfile;
            syncMenuSwitches();
            if (typeof window.__lcRefreshPrivacyOverlay === 'function') window.__lcRefreshPrivacyOverlay();
            sendHost('TOGGLE_PRIVACY_PROFILE');
        });
        const privOvRow = document.getElementById('dd-row-priv-overlay');
        if (privOvRow) {
            privOvRow.addEventListener('click', () => {
                if (typeof window.__lcToggleDisCRustPrivacyOverlayManual === 'function') {
                    window.__lcToggleDisCRustPrivacyOverlayManual();
                }
            });
        }
        document.getElementById('lc-btn-priv-enable-all').addEventListener('click', (e) => {
            e.stopPropagation();
            const allOn = !!(cfg.PrivacyHideName && cfg.PrivacyHideUserId && cfg.PrivacyHideProfile);
            const targetState = !allOn;
            cfg.PrivacyHideName = targetState;
            cfg.PrivacyHideUserId = targetState;
            cfg.PrivacyHideProfile = targetState;
            syncMenuSwitches();
            sendHost(targetState ? 'ENABLE_ALL_PRIVACY_MASKS' : 'DISABLE_ALL_PRIVACY_MASKS');
        });

        document.getElementById('dd-row-quest').addEventListener('click', () => {
            cfg.QuestHelperEnabled = !cfg.QuestHelperEnabled;
            if (cfg.QuestHelperEnabled) cfg.QuestCompleterInstalled = true;
            syncMenuSwitches();
            applyQuestOnlyWorkspaceLayout();
            sendHost('TOGGLE_QUEST_HELPER');
        });
        document.getElementById('lc-q-cfg-scanstart').addEventListener('click', async () => {
            if (!cfg.QuestHelperEnabled) {
                cfg.QuestCompleterInstalled = true;
                cfg.QuestHelperEnabled = true;
                syncMenuSwitches();
                applyQuestOnlyWorkspaceLayout();
                sendHost('TOGGLE_QUEST_HELPER');
            }
            await refreshQuestListDisplay(true);
            runQuestCompleterQueue();
        });
        document.getElementById('lc-q-row-autoscan').addEventListener('click', () => sendHost('TOGGLE_QUEST_AUTOSCAN'));
        document.getElementById('lc-q-row-autostart').addEventListener('click', () => sendHost('TOGGLE_QUEST_AUTOSTART'));
        document.getElementById('lc-q-row-desktop-default').addEventListener('click', () => {
            cfg.QuestDesktopByDefault = (cfg.QuestDesktopByDefault === false) ? true : false;
            syncMenuSwitches();
            refreshQuestListDisplay(false);
            sendHost('TOGGLE_QUEST_DESKTOP_DEFAULT');
        });
        document.getElementById('lc-q-row-autofab').addEventListener('click', () => sendHost('TOGGLE_QUEST_AUTOFAB'));
        document.getElementById('lc-q-row-autoupdate').addEventListener('click', () => sendHost('TOGGLE_AUTO_UPDATE_QUEST'));
        document.getElementById('dd-row-vencord').addEventListener('click', () => sendHost('TOGGLE_VENCORD'));
        document.getElementById('dd-row-krisp').addEventListener('click', () => sendHost('TOGGLE_KRISP_SPOOF'));
        document.getElementById('dd-row-userscripts').addEventListener('click', () => sendHost('OPEN_USERSCRIPTS'));

        for (const lmBtn of menuOverlay.querySelectorAll('.lc-launch-mode-btn')) {
            lmBtn.addEventListener('click', () => {
                const mode = lmBtn.getAttribute('data-lmode') || 'Ask';
                cfg.StartupLaunchMode = mode;
                syncMenuSwitches();
                sendHost('SET_LAUNCH_MODE:' + mode);
            });
        }
        document.getElementById('dd-row-switch-workspace').addEventListener('click', () => {
            menuOpen = false;
            menuOverlay.style.display = 'none';
            updateTitleBarElements();
            if (window.__lcSetQuestOnlyMode) window.__lcSetQuestOnlyMode(!cfg.QuestOnlyModeActive, true);
        });
        document.getElementById('dd-row-autoupdate-all').addEventListener('click', () => sendHost('TOGGLE_AUTO_UPDATE_ALL'));
        const otaInput = document.getElementById('lc-ota-url-input');
        const otaSaveBtn = document.getElementById('lc-ota-url-save');
        if (otaSaveBtn && otaInput) {
            otaSaveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = (otaInput.value || '').trim();
                if (val) {
                    cfg.OtaManifestUrl = val;
                    sendHost('SET_OTA_MANIFEST_URL:' + val);
                    otaSaveBtn.textContent = 'Saved';
                    setTimeout(() => { otaSaveBtn.textContent = 'Save'; }, 1400);
                }
            });
        }
        document.getElementById('lc-btn-update-all-now').addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.__lcRunUnifiedUpdater) window.__lcRunUnifiedUpdater(true);
        });
        for (const rBtn of menuOverlay.querySelectorAll('.lc-q-refresh-btn')) {
            rBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sec = parseInt(rBtn.getAttribute('data-qref') || '5', 10) || 5;
                cfg.QuestRefreshIntervalSec = sec;
                syncMenuSwitches();
                sendHost('SET_QUEST_REFRESH_SEC:' + sec);
            });
        }
        for (const cBtn of menuOverlay.querySelectorAll('.lc-q-cooldown-btn')) {
            cBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sec = parseInt(cBtn.getAttribute('data-qcd') || '10', 10) || 10;
                cfg.QuestCooldownDelaySec = sec;
                syncMenuSwitches();
                sendHost('SET_QUEST_COOLDOWN_SEC:' + sec);
            });
        }

        function openConfirmAppActionModal(actionKind) {
            const isRestart = actionKind === 'restart';
            let modal = document.getElementById('lc-confirm-action-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'lc-confirm-action-modal';
                modal.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;user-select:none;font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;';
                document.body.appendChild(modal);
            }
            const titleText = isRestart ? 'Do you really want to restart?' : 'Do you really want to quit?';
            const descText = isRestart
                ? `This will close and relaunch ${getEffectiveAppName()} immediately.`
                : `This will close ${getEffectiveAppName()} completely.`;
            const confirmLabel = isRestart ? 'Restart' : 'Quit';

            modal.innerHTML = `
                <div style='width:320px;background:#1e1f22;border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:16px;box-shadow:0 18px 46px rgba(0,0,0,0.75);color:#dbdee1;'>
                    <div style='font-size:14px;font-weight:600;color:#f2f3f5;margin-bottom:6px;'>${titleText}</div>
                    <div style='font-size:12px;color:#949ba4;line-height:1.45;margin-bottom:16px;'>${descText}</div>
                    <div style='display:grid;grid-template-columns:1fr 1fr;gap:8px;'>
                        <button id='lc-confirm-cancel-btn' class='lc-subtle-btn' style='height:32px;width:100%;'>Cancel</button>
                        <button id='lc-confirm-ok-btn' class='lc-primary-btn' style='height:32px;width:100%;'>${confirmLabel}</button>
                    </div>
                </div>
            `;
            modal.style.display = 'flex';
            modal.onclick = (ev) => {
                if (ev.target === modal) modal.style.display = 'none';
            };
            document.getElementById('lc-confirm-cancel-btn').onclick = () => {
                modal.style.display = 'none';
            };
            document.getElementById('lc-confirm-ok-btn').onclick = () => {
                modal.style.display = 'none';
                sendHost(isRestart ? 'RESTART_APP' : 'EXIT_APP');
            };
        }

        document.getElementById('dd-row-restart').addEventListener('click', (e) => {
            e.stopPropagation();
            openConfirmAppActionModal('restart');
        });
        document.getElementById('dd-row-exit').addEventListener('click', (e) => {
            e.stopPropagation();
            openConfirmAppActionModal('quit');
        });

        document.addEventListener('click', (e) => {
            if (menuOpen && (!titleBarBtn || !titleBarBtn.contains(e.target))) {
                menuOpen = false;
                menuOverlay.style.display = 'none';
                updateTitleBarElements();
            }
        });
        syncMenuSwitches();
    }

    function applyPrivacyMaskingStyles() {
        if (!document.head) return;
        let privStyle = document.getElementById('lc-privacy-masking-style');
        if (!privStyle) {
            privStyle = document.createElement('style');
            privStyle.id = 'lc-privacy-masking-style';
            document.head.appendChild(privStyle);
        }
        let css = '';
        if (cfg && cfg.PrivacyHideName) {
            css += `
                [class*="username_"],
                [class*="headerText_"] [class*="username_"],
                [class*="name_"] [class*="lineClamp"],
                [class*="memberInner_"] [class*="name_"],
                [class*="channelHeader_"] [class*="title_"],
                [class*="nick_"] {
                    filter: blur(5px) !important;
                    transition: filter 0.15s ease !important;
                }
                [class*="username_"]:hover,
                [class*="memberInner_"]:hover [class*="name_"],
                [class*="nick_"]:hover {
                    filter: none !important;
                }
            `;
        }
        if (cfg && cfg.PrivacyHideUserId) {
            css += `
                [class*="clanTag_"],
                [class*="chipletContainerInner_"],
                [class*="botTag_"],
                .mention,
                [class*="discriminator_"],
                [class*="userTag_"],
                [class*="subtext_"] {
                    filter: blur(5px) !important;
                    transition: filter 0.15s ease !important;
                }
                [class*="clanTag_"]:hover,
                .mention:hover,
                [class*="userTag_"]:hover {
                    filter: none !important;
                }
            `;
        }
        if (cfg && cfg.PrivacyHideProfile) {
            css += `
                img[class*="avatar_"],
                [class*="avatar_"] img,
                [class*="avatarStack_"] img,
                [class*="replyAvatar_"] {
                    filter: grayscale(100%) blur(7px) !important;
                    transition: filter 0.15s ease !important;
                }
                img[class*="avatar_"]:hover,
                [class*="avatar_"]:hover img {
                    filter: none !important;
                }
                [class*="chat_"] [class*="avatarDecoration"],
                [class*="messagesWrapper_"] [class*="avatarDecoration"],
                [class*="scrollerInner_"] [class*="avatarDecoration"],
                li[id^="chat-messages-"] [class*="avatarDecoration"],
                [class*="message_"] [class*="avatarDecoration"],
                [class*="repliedMessage_"] [class*="avatarDecoration"],
                [class*="chat_"] img[src*="avatar-decoration"],
                [class*="message_"] img[src*="avatar-decoration"],
                [class*="chat_"] svg[class*="avatarDecoration"] {
                    display: none !important;
                    opacity: 0 !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
            `;
        }
        privStyle.textContent = css;
    }

    function syncMenuSwitches() {
        const setSw = (id, on) => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('active', !!on);
        };
        setSw('lc-sw-titlebar-pagetitle', cfg.ShowTitleBarPageTitle !== false);
        setSw('lc-sw-titlebar-ram', cfg.ShowTitleBarRam !== false);
        setSw('lc-sw-reducemotion', !cfg.ReduceMotionEnabled);
        if (document.body) {
            document.body.classList.toggle('lc-no-animations', !!cfg.ReduceMotionEnabled);
        }
        setSw('lc-sw-eco', cfg.EcoModeEnabled !== false);
        setSw('lc-sw-autotrim', cfg.AutoTrimRamEnabled !== false);
        setSw('lc-sw-titlebar-btn', cfg.ShowTitleBarConfigBtn !== false);
        setSw('lc-sw-titlebar-quest-btn', cfg.ShowTitleBarQuestBtn !== false);
        setSw('lc-sw-titlebar-shortcuts-btn', cfg.ShowTitleBarShortcutsBtn !== false);
        const cfgQBtn = document.getElementById('lc-btn-cfg-open-questonly');
        if (cfgQBtn) {
            cfgQBtn.textContent = cfg.QuestOnlyModeActive ? 'Exit Quests UI' : 'Open Quests UI';
        }
        setSw('lc-sw-notifications', cfg.DesktopNotificationsEnabled !== false);
        setSw('lc-sw-desktop-shortcut', cfg.DesktopShortcutEnabled !== false);
        setSw('lc-sw-startmenu-shortcut', cfg.StartMenuShortcutEnabled !== false);
        setSw('lc-sw-win-startup', !!cfg.RunOnWindowsStartup);
        setSw('lc-sw-game-activity', cfg.GameActivityEnabled !== false);
        setSw('lc-sw-opt-quest-service', cfg.QuestCompleterInstalled !== false);
        setSw('lc-sw-opt-vencord-service', cfg.VencordInstalled !== false && !!cfg.VencordEnabled);
        setSw('lc-sw-priv-name', !!cfg.PrivacyHideName);
        setSw('lc-sw-priv-userid', !!cfg.PrivacyHideUserId);
        setSw('lc-sw-priv-profile', !!cfg.PrivacyHideProfile);
        const privAllBtn = document.getElementById('lc-btn-priv-enable-all');
        if (privAllBtn) {
            const allEnabled = !!(cfg.PrivacyHideName && cfg.PrivacyHideUserId && cfg.PrivacyHideProfile);
            privAllBtn.textContent = allEnabled ? 'Disable All' : 'Enable All';
        }
        applyPrivacyMaskingStyles();
        setSw('lc-sw-quest', cfg.QuestCompleterInstalled !== false && !!cfg.QuestHelperEnabled);
        setSw('lc-sw-q-autoscan', cfg.QuestAutoScan !== false);
        setSw('lc-sw-q-autostart', !!cfg.QuestAutoStart);
        setSw('lc-sw-q-desktop-default', cfg.QuestDesktopByDefault !== false);
        setSw('lc-sw-q-autofab', !!cfg.QuestAutoCollapseFab);
        setSw('lc-sw-q-autoupdate', cfg.AutoUpdateQuestEngine !== false);
        setSw('lc-sw-vencord', cfg.VencordInstalled !== false && !!cfg.VencordEnabled);
        setSw('lc-sw-krisp', cfg.KrispChromeSpoofEnabled !== false);
        setSw('lc-sw-autoupdate-all', cfg.AutoUpdateAllEnabled !== false);

        const nameInput = document.getElementById('lc-custom-name-input');
        if (nameInput && document.activeElement !== nameInput) {
            nameInput.value = getEffectiveAppName();
        }
        const iconPrev = document.getElementById('lc-custom-icon-preview');
        const iconStat = document.getElementById('lc-custom-icon-status');
        if (iconPrev) {
            if (cfg.AppIconPreviewDataUri) {
                iconPrev.innerHTML = `<img src='${cfg.AppIconPreviewDataUri}' alt='' style='width:18px;height:18px;border-radius:4px;object-fit:cover;display:block;' />`;
            } else {
                iconPrev.innerHTML = MSR.image;
            }
        }
        if (iconStat) {
            iconStat.textContent = (cfg.CustomIconPath && cfg.CustomIconPath.length > 0)
                ? 'Custom icon active on window, tray & shortcuts'
                : 'Apply .ico or .png to window, tray & shortcuts';
        }

        const curIconStyle = cfg.ConfigIconStyle || 'Sliders';
        for (const isBtn of document.querySelectorAll('.lc-icon-style-btn')) {
            const st = isBtn.getAttribute('data-istyle') || 'Sliders';
            isBtn.classList.toggle('active', st === curIconStyle);
        }

        for (const chip of document.querySelectorAll('.lc-q-hud-fchip')) {
            const fk = chip.getAttribute('data-qfilter');
            if (fk === 'orbs') chip.classList.toggle('active', cfg.QuestFilterOrbs !== false);
            else if (fk === 'frames') chip.classList.toggle('active', cfg.QuestFilterFrames !== false);
            else if (fk === 'ads') chip.classList.toggle('active', cfg.QuestFilterAds !== false);
            else if (fk === 'codes') chip.classList.toggle('active', cfg.QuestFilterCodes !== false);
            else if (fk === 'nitro') chip.classList.toggle('active', cfg.QuestFilterNitro !== false);
        }

        const curLaunchMode = cfg.StartupLaunchMode || 'Ask';
        for (const lmBtn of document.querySelectorAll('.lc-launch-mode-btn')) {
            const m = lmBtn.getAttribute('data-lmode') || 'Ask';
            lmBtn.classList.toggle('active', m === curLaunchMode);
        }
        const curRefSec = String(cfg.QuestRefreshIntervalSec || 5);
        for (const rBtn of document.querySelectorAll('.lc-q-refresh-btn')) {
            rBtn.classList.toggle('active', rBtn.getAttribute('data-qref') === curRefSec);
        }
        const curCdSec = String(cfg.QuestCooldownDelaySec || 10);
        for (const cBtn of document.querySelectorAll('.lc-q-cooldown-btn')) {
            cBtn.classList.toggle('active', cBtn.getAttribute('data-qcd') === curCdSec);
        }
        const wsLbl = document.getElementById('lc-misc-workspace-lbl');
        if (wsLbl) {
            wsLbl.textContent = cfg.QuestOnlyModeActive ? 'Revert to Full Discord View' : 'Switch to Quests Only UI';
        }
        const step = Math.max(-10, Math.min(10, cfg.DiscordUiScaleStep || 0));
        const scaleLbl = document.getElementById('lc-ui-scale-lbl');
        if (scaleLbl) scaleLbl.textContent = `${100 + step * 5}%`;
        updateTitleBarElements();
    }

    function clampFloatingPanelsToViewport() {
        try {
            if (typeof syncStreamHubPositionWithPipAndViewport === 'function') {
                syncStreamHubPositionWithPipAndViewport();
            }
            if (menuOverlay && menuOverlay.style.display !== 'none') {
                const vw = window.innerWidth || 800;
                const vh = window.innerHeight || 600;
                const rect = menuOverlay.getBoundingClientRect();
                if (menuOverlay.style.left && menuOverlay.style.left !== 'auto') {
                    const maxL = Math.max(8, vw - rect.width - 8);
                    const maxT = Math.max(42, vh - rect.height - 8);
                    const curL = parseInt(menuOverlay.style.left, 10) || 8;
                    const curT = parseInt(menuOverlay.style.top, 10) || 42;
                    if (curL > maxL || curL < 6 || vw < 620) {
                        menuOverlay.style.left = 'auto';
                        menuOverlay.style.right = '10px';
                    } else {
                        menuOverlay.style.left = Math.min(Math.max(8, curL), maxL) + 'px';
                    }
                    menuOverlay.style.top = Math.min(Math.max(42, curT), maxT) + 'px';
                } else {
                    menuOverlay.style.right = '10px';
                    menuOverlay.style.top = '42px';
                }
            }
            if (questHud && !cfg.QuestOnlyModeActive && questHud.style.display !== 'none' && questHud.style.left && questHud.style.left !== 'auto') {
                const vw = window.innerWidth || 800;
                const vh = window.innerHeight || 600;
                const r = questHud.getBoundingClientRect();
                const maxL = Math.max(6, vw - r.width - 6);
                const maxT = Math.max(42, vh - r.height - 6);
                const curL = parseInt(questHud.style.left, 10) || 6;
                const curT = parseInt(questHud.style.top, 10) || 42;
                questHud.style.left = Math.min(Math.max(6, curL), maxL) + 'px';
                questHud.style.top = Math.min(Math.max(42, curT), maxT) + 'px';
            }
        } catch (e) {}
    }

    window.addEventListener('resize', clampFloatingPanelsToViewport);

    window.__litecordToggleMenu = () => {
        if (!menuOverlay || !menuOverlay.isConnected) {
            menuOverlay = null;
            createTopDropdownMenu();
        }
        if (menuOverlay) {
            menuOpen = !menuOpen;
            if (menuOpen) {
                syncMenuSwitches();
                menuOverlay.style.display = 'flex';
                clampFloatingPanelsToViewport();
                sendHost('MENU_OPENED');
            } else {
                menuOverlay.style.display = 'none';
            }
            updateTitleBarElements();
        }
    };

    window.__litecordUpdateNativeRam = (totalMb, hostMb) => {
        totalEngineRamMb = totalMb;
        nativeHostRamMb = hostMb;
        const mRam = document.getElementById('lc-menu-ram');
        if (mRam) mRam.textContent = `${totalMb} MB (${hostMb} MB host)`;
        const hRam = document.getElementById('lc-hdr-ram-badge');
        if (hRam) hRam.textContent = `${totalMb} MB`;
        const tbRam = document.getElementById('lc-tb-ram-text');
        if (tbRam) tbRam.textContent = `${totalMb} MB`;
    };

    // 4. QUEST COMPLETER HUD & ENGINE
    // ------------------------------------------------------------------------
    let questRunnerActive = false;
    let questStopRequested = false;

    function getOrderedQuestTasks() {
        if (cfg.QuestDesktopByDefault === false) {
            return ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'PLAY_ON_XBOX', 'PLAY_ON_PLAYSTATION', 'PLAY_ON_DESKTOP', 'PLAY_ON_DESKTOP_V2', 'PLAY_ACTIVITY', 'STREAM_ON_DESKTOP'];
        }
        return ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'PLAY_ON_DESKTOP', 'PLAY_ON_DESKTOP_V2', 'PLAY_ACTIVITY', 'STREAM_ON_DESKTOP', 'PLAY_ON_XBOX', 'PLAY_ON_PLAYSTATION'];
    }

    function setQuestStatusDot(status) {
        questStateStatus = status;
        const col = status === 'active' ? '#23a55a' : (status === 'error' ? '#f23f43' : '#f0b232');
        const fabDotEl = document.getElementById('lc-fab-dot');
        const hdrDotEl = document.getElementById('lc-quest-hdr-dot');
        if (fabDotEl) fabDotEl.style.background = col;
        if (hdrDotEl) hdrDotEl.style.background = col;
    }

    function setQuestLog(msg, color = '#949ba4', isError = false) {
        if (isError) setQuestStatusDot('error');
        const titleEl = document.getElementById('lc-quest-active-title');
        const typeEl = document.getElementById('lc-quest-active-type');
        if (titleEl) {
            titleEl.textContent = msg;
            titleEl.style.color = color;
        }
        if (typeEl && !questRunnerActive) {
            typeEl.textContent = '';
            typeEl.style.display = 'none';
        }
    }

    function updateFabProgressSummary(startedCount, pct) {
        if (typeof startedCount === 'number') activeStartedQuestCount = startedCount;
        if (typeof pct === 'number') currentQuestPercent = Math.min(100, Math.max(0, Math.round(pct)));
        const fabCountEl = document.getElementById('lc-fab-count');
        const fabBarFillEl = document.getElementById('lc-fab-bar-fill');
        const fabPctEl = document.getElementById('lc-fab-pct');
        if (fabCountEl) fabCountEl.textContent = `${activeStartedQuestCount} ${activeStartedQuestCount === 1 ? 'Quest' : 'Quests'}`;
        if (fabBarFillEl) fabBarFillEl.style.width = `${currentQuestPercent}%`;
        if (fabPctEl) fabPctEl.textContent = `${currentQuestPercent}%`;
        if (questStateStatus !== 'error') {
            setQuestStatusDot(questRunnerActive ? 'active' : 'paused');
        }
    }

    function resetQuestHudToOrigin() {
        savedExpandedLeft = -1;
        savedExpandedTop = -1;
        if (questHud && !cfg.QuestOnlyModeActive) {
            questHud.style.left = 'auto';
            questHud.style.top = 'auto';
            questHud.style.right = '16px';
            questHud.style.bottom = '16px';
        }
    }

    function setQuestCollapsedState(collapsed) {
        if (cfg.QuestOnlyModeActive) {
            isQuestCollapsed = false;
            const cEl = document.getElementById('lc-quest-expanded-card');
            const fEl = document.getElementById('lc-quest-fab-pill');
            if (cEl) cEl.style.display = 'flex';
            if (fEl) fEl.style.display = 'none';
            return;
        }
        isQuestCollapsed = !!collapsed;
        const cardEl = document.getElementById('lc-quest-expanded-card');
        const fabEl = document.getElementById('lc-quest-fab-pill');
        if (cardEl && fabEl) {
            cardEl.style.display = isQuestCollapsed ? 'none' : 'flex';
            fabEl.style.display = isQuestCollapsed ? 'inline-flex' : 'none';
        }
        // Reset both the maximized tray and the minimized pill to original bottom-right position on toggle,
        // while keeping both freely draggable via makeElementDraggable!
        resetQuestHudToOrigin();
    }

    function getFriendlyQuestTaskLabel(taskName) {
        if (taskName === 'WATCH_VIDEO') return 'Watch AD';
        if (taskName === 'WATCH_VIDEO_ON_MOBILE') return 'Watch Mobile AD';
        if (taskName === 'PLAY_ON_DESKTOP' || taskName === 'PLAY_ON_DESKTOP_V2') return 'Play Game (Desktop)';
        if (taskName === 'STREAM_ON_DESKTOP') return 'Stream Game (Desktop)';
        if (taskName === 'PLAY_ACTIVITY') return 'Play Activity';
        if (taskName === 'PLAY_ON_XBOX') return 'Play Game (Xbox)';
        if (taskName === 'PLAY_ON_PLAYSTATION') return 'Play Game (PlayStation)';
        return 'Quest Task';
    }

    function classifyQuestRewardCategory(rawQuest, taskName) {
        let hasOrbs = false, hasFrames = false, hasNitro = false, hasCodes = false, orbAmount = 0;
        try {
            const cfgObj = rawQuest?.config || rawQuest || {};
            const rewardsCfg = cfgObj.rewardsConfig || cfgObj.rewards_config || rawQuest?.rewardsConfig || rawQuest?.rewards_config || {};
            const rewards = Array.isArray(rewardsCfg.rewards) ? rewardsCfg.rewards : (Array.isArray(cfgObj.rewards) ? cfgObj.rewards : []);
            for (const rw of rewards) {
                if (!rw || typeof rw !== 'object') continue;
                const rType = Number(rw.type ?? rw.reward_type ?? 0);
                const rName = String(rw.messages?.name || rw.messages?.name_with_article || rw.name || '').toLowerCase();
                const orbs = Number(rw.orbQuantity ?? rw.orb_quantity ?? 0);
                if (rType === 4 || orbs > 0 || /\borbs?\b/i.test(rName)) {
                    hasOrbs = true;
                    if (orbs > 0) orbAmount += orbs;
                } else if (rType === 3 || rw.collectibleProduct != null || /decoration|frame|avatar|profile effect/i.test(rName)) {
                    hasFrames = true;
                } else if (rType === 5 || /\bnitro\b/i.test(rName)) {
                    hasNitro = true;
                } else if (rType === 1 || rType === 2) {
                    hasCodes = true;
                }
            }
            if (!hasOrbs && !hasFrames && !hasNitro && !hasCodes) hasCodes = true;
        } catch (e) { hasCodes = true; }

        const isWatchAd = (taskName === 'WATCH_VIDEO' || taskName === 'WATCH_VIDEO_ON_MOBILE');
        let primaryKey = 'CODES';
        let primaryLabel = 'Game Reward';
        if (hasOrbs) { primaryKey = 'ORBS'; primaryLabel = orbAmount > 0 ? `${orbAmount} Orbs` : 'Orbs'; }
        else if (hasFrames) { primaryKey = 'FRAMES'; primaryLabel = 'Frame'; }
        else if (hasNitro) { primaryKey = 'NITRO'; primaryLabel = 'Nitro'; }
        return { key: primaryKey, label: primaryLabel, hasOrbs, hasFrames, hasNitro, hasCodes, isWatchAd };
    }

    function matchesQuestBetaFilter(rewardCat, taskName) {
        if (!rewardCat) return true;
        const fOrbs = cfg.QuestFilterOrbs !== false;
        const fFrames = cfg.QuestFilterFrames !== false;
        const fAds = cfg.QuestFilterAds !== false;
        const fCodes = cfg.QuestFilterCodes !== false;
        const fNitro = cfg.QuestFilterNitro !== false;
        if (!fOrbs && !fFrames && !fAds && !fCodes && !fNitro) return false;
        const isWatchAd = (taskName === 'WATCH_VIDEO' || taskName === 'WATCH_VIDEO_ON_MOBILE' || rewardCat.isWatchAd);
        if (fAds && !fOrbs && !fFrames && !fCodes && !fNitro) return isWatchAd;
        if (isWatchAd && !fAds) return false;
        if (rewardCat.hasOrbs && fOrbs) return true;
        if (rewardCat.hasFrames && fFrames) return true;
        if (rewardCat.hasNitro && fNitro) return true;
        if (rewardCat.hasCodes && fCodes) return true;
        return false;
    }

    function setQuestProgressUI(label, current, total, questTypeLabel = '') {
        const titleEl = document.getElementById('lc-quest-active-title');
        const typeEl = document.getElementById('lc-quest-active-type');
        const barEl = document.getElementById('lc-quest-bar-fill');
        const pctEl = document.getElementById('lc-quest-pct');
        if (titleEl) {
            titleEl.textContent = label;
            titleEl.style.color = '#f2f3f5';
        }
        if (typeEl) {
            if (questTypeLabel) {
                typeEl.innerHTML = `<span style='display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:800;background:rgba(88,101,242,0.22);border:1px solid rgba(88,101,242,0.5);color:#a5b4fc;margin-right:4px;'>ACTIVE</span><span>${questTypeLabel}</span>`;
                typeEl.style.display = 'block';
            } else {
                typeEl.textContent = '';
                typeEl.style.display = 'none';
            }
        }
        const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
        if (barEl) barEl.style.width = pct + '%';
        if (pctEl) pctEl.textContent = total > 0 ? `${pct}% (${Math.floor(current)}/${total}s)` : '';
        updateFabProgressSummary(activeStartedQuestCount, pct);
    }

    function getQuestTaskProgressSeconds(nq, taskName) {
        if (!nq) return 0;
        const prog = nq.progress || {};
        if (taskName && typeof prog[taskName]?.value === 'number' && !isNaN(prog[taskName].value)) {
            return Math.floor(prog[taskName].value);
        }
        for (const k of ['PLAY_ON_DESKTOP', 'PLAY_ON_DESKTOP_V2', 'WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'PLAY_ACTIVITY', 'STREAM_ON_DESKTOP', 'PLAY_ON_XBOX', 'PLAY_ON_PLAYSTATION']) {
            if (typeof prog[k]?.value === 'number' && !isNaN(prog[k].value)) {
                return Math.floor(prog[k].value);
            }
        }
        if (typeof nq.streamProgressSeconds === 'number' && nq.streamProgressSeconds > 0) {
            return Math.floor(nq.streamProgressSeconds);
        }
        return 0;
    }

    function extractServerQuestProgress(bodyObj, taskName, fallbackVal = 0) {
        const userStatus = bodyObj?.user_status || bodyObj?.userStatus || bodyObj || {};
        const progMap = userStatus.progress || {};
        let val = null;
        if (taskName && typeof progMap[taskName]?.value === 'number') {
            val = progMap[taskName].value;
        } else {
            for (const k of ['PLAY_ON_DESKTOP', 'PLAY_ON_DESKTOP_V2', 'WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'PLAY_ACTIVITY', 'STREAM_ON_DESKTOP', 'PLAY_ON_XBOX', 'PLAY_ON_PLAYSTATION']) {
                if (typeof progMap[k]?.value === 'number') {
                    val = progMap[k].value;
                    break;
                }
            }
        }
        if (val === null) {
            const sp = userStatus.stream_progress_seconds ?? userStatus.streamProgressSeconds;
            if (typeof sp === 'number') val = sp;
        }
        const completedAt = userStatus.completed_at || userStatus.completedAt || (taskName ? (progMap[taskName]?.completed_at || progMap[taskName]?.completedAt) : null) || null;
        return {
            value: typeof val === 'number' && !isNaN(val) ? Math.floor(val) : fallbackVal,
            hasServerValue: typeof val === 'number' && !isNaN(val),
            completedAt,
            userStatus
        };
    }

    function dispatchQuestStatusToDiscord(mods, questId, userStatus) {
        if (!mods?.FluxDispatcher || !userStatus || typeof userStatus !== 'object') return;
        try {
            mods.FluxDispatcher.dispatch({
                type: 'QUESTS_SEND_HEARTBEAT_SUCCESS',
                questId: questId,
                userStatus: userStatus,
                __lcSynthetic: true
            });
        } catch (e) {}
        try {
            mods.FluxDispatcher.dispatch({
                type: 'QUESTS_USER_STATUS_UPDATE',
                user_status: Object.assign({ quest_id: questId }, userStatus)
            });
        } catch (e) {}
    }

    function updateLiveQuestRowProgress(questId, doneSec, targetSec) {
        try {
            const badge = document.querySelector(`[data-qprog-id='${questId}']`);
            if (badge) badge.textContent = `${Math.floor(doneSec)}/${targetSec}s`;
        } catch (e) {}
    }

    function normalizeQuest(q) {
        if (!q) return null;
        const cfgObj = q.config || {};
        const userStatus = q.userStatus || q.user_status || {};
        const enrolledAt = userStatus.enrolledAt || userStatus.enrolled_at || null;
        const completedAt = userStatus.completedAt || userStatus.completed_at || null;
        const claimedAt = userStatus.claimedAt || userStatus.claimed_at || null;
        const startsAt = cfgObj.startsAt || cfgObj.starts_at || null;
        const expiresAt = cfgObj.expiresAt || cfgObj.expires_at || null;
        const messages = cfgObj.messages || {};
        const qName = messages.questName || messages.quest_name || cfgObj.application?.name || ('Quest ' + q.id);
        const taskConfig = cfgObj.taskConfigV2 || cfgObj.task_config_v2 || cfgObj.taskConfig || cfgObj.task_config;
        const streamProgressSeconds = userStatus.streamProgressSeconds ?? userStatus.stream_progress_seconds ?? 0;
        return {
            id: q.id,
            name: qName,
            startsAt,
            expiresAt,
            enrolledAt,
            completedAt,
            claimedAt,
            progress: userStatus.progress || {},
            streamProgressSeconds,
            taskConfig,
            applicationId: cfgObj.application?.id,
            raw: q
        };
    }

    async function fetchAllQuestsFromStoreOrApi(forceApi = false) {
        const mods = resolveDiscordModules();
        let rawList = [];

        if (!forceApi && mods.QuestsStore && mods.QuestsStore.quests) {
            const qMap = mods.QuestsStore.quests;
            rawList = Array.from(qMap instanceof Map ? qMap.values() : Object.values(qMap));
        }
        if (rawList.length === 0 && !forceApi && interceptedQuestsList.length > 0) {
            rawList = interceptedQuestsList;
        }
        if ((rawList.length === 0 || forceApi) && mods.api) {
            try {
                const res = await mods.api.get({ url: '/quests/@me' });
                if (Array.isArray(res?.body?.quests) && res.body.quests.length > 0) {
                    rawList = res.body.quests;
                    interceptedQuestsList = rawList;
                } else if (Array.isArray(res?.body) && res.body.length > 0) {
                    rawList = res.body;
                    interceptedQuestsList = rawList;
                }
            } catch (e) {}
        }
        if (rawList.length === 0 && mods.QuestsStore && mods.QuestsStore.quests) {
            const qMap = mods.QuestsStore.quests;
            rawList = Array.from(qMap instanceof Map ? qMap.values() : Object.values(qMap));
        }

        const now = Date.now();
        const enrolled = [], unEnrolled = [], claimable = [];
        const orderedTasks = getOrderedQuestTasks();

        for (const r of rawList) {
            const nq = normalizeQuest(r);
            if (!nq || !nq.taskConfig || !nq.taskConfig.tasks) continue;
            if (nq.id === '1248385850622869556' || nq.id === '1412491570820812933') continue;
            if (nq.startsAt && new Date(nq.startsAt).getTime() > now) continue;
            if (nq.expiresAt && new Date(nq.expiresAt).getTime() <= now) continue;

            const availableKeys = Object.keys(nq.taskConfig.tasks || {});
            const desktopKeys = ['WATCH_VIDEO', 'WATCH_VIDEO_ON_MOBILE', 'PLAY_ON_DESKTOP', 'PLAY_ON_DESKTOP_V2', 'PLAY_ACTIVITY', 'STREAM_ON_DESKTOP'];
            let taskKey = null;
            if (cfg.QuestDesktopByDefault !== false) {
                taskKey = desktopKeys.find(k => nq.taskConfig.tasks[k] != null) || orderedTasks.find(k => nq.taskConfig.tasks[k] != null);
            } else {
                taskKey = orderedTasks.find(k => nq.taskConfig.tasks[k] != null);
            }
            if (!taskKey && availableKeys.length > 0) taskKey = availableKeys[0];
            if (!taskKey) continue;

            const taskData = nq.taskConfig.tasks[taskKey];
            const isConsoleTask = (taskKey === 'PLAY_ON_XBOX' || taskKey === 'PLAY_ON_PLAYSTATION');
            const friendlyType = getFriendlyQuestTaskLabel(taskKey);
            const rewardCat = classifyQuestRewardCategory(r, taskKey);
            const resolvedAppId = taskData?.applications?.[0]?.id || nq.applicationId || r?.config?.application?.id;
            const item = {
                quest: nq,
                taskName: taskKey,
                taskData: taskData,
                friendlyType: friendlyType,
                rewardCategoryKey: rewardCat.key,
                rewardCategoryLabel: rewardCat.label,
                typeAndRewardText: `${friendlyType} • ${rewardCat.label}`,
                deviceLabel: isConsoleTask ? 'Console' : 'Desktop',
                appId: resolvedAppId
            };

            if (nq.completedAt) {
                if (!nq.claimedAt) claimable.push(item);
                continue;
            }
            if (!matchesQuestBetaFilter(rewardCat, taskKey)) continue;
            if (nq.enrolledAt) enrolled.push(item);
            else unEnrolled.push(item);
        }
        if (cfg.QuestDesktopByDefault !== false) {
            const sortDesktopFirst = (a, b) => (a.deviceLabel === 'Desktop' ? 0 : 1) - (b.deviceLabel === 'Desktop' ? 0 : 1);
            enrolled.sort(sortDesktopFirst);
            unEnrolled.sort(sortDesktopFirst);
        }
        return { mods, enrolled, unEnrolled, claimable };
    }

    async function syncQuestsStoreFromServer(mods) {
        if (!mods?.api) return;
        try {
            const res = await mods.api.get({ url: '/quests/@me' });
            const questsArr = Array.isArray(res?.body?.quests) ? res.body.quests : (Array.isArray(res?.body) ? res.body : null);
            if (questsArr && questsArr.length > 0) {
                interceptedQuestsList = questsArr;
                if (mods.FluxDispatcher) {
                    try {
                        mods.FluxDispatcher.dispatch({
                            type: 'QUESTS_FETCH_CURRENT_QUESTS_SUCCESS',
                            quests: questsArr,
                            excludedQuests: res?.body?.excluded_quests || []
                        });
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }

    async function claimQuestReward(questId, questName) {
        const mods = resolveDiscordModules(true);
        if (!mods.api) return;
        try {
            setQuestLog(`Claiming: ${questName}...`, '#818cf8');
            await syncQuestsStoreFromServer(mods);

            // Determine valid reward platforms configured on the quest (0 = Cross-Platform/Orbs/Decorations, 1 = PC, etc.)
            let platformsToTry = [0];
            try {
                const qObj = mods.QuestsStore?.getQuest?.(questId)
                    || interceptedQuestsList.find(q => q && String(q.id) === String(questId));
                const cfgPlatforms = qObj?.config?.rewardsConfig?.platforms
                    || qObj?.config?.rewards_config?.platforms;
                if (Array.isArray(cfgPlatforms) && cfgPlatforms.length > 0) {
                    platformsToTry = [...cfgPlatforms];
                    if (!platformsToTry.includes(0)) platformsToTry.push(0);
                }
            } catch (e) {}

            for (const plat of platformsToTry) {
                try {
                    const res = await mods.api.post({
                        url: `/quests/${questId}/claim-reward`,
                        body: { platform: plat, location: 11, is_targeted: false }
                    });
                    if (res && res.body) {
                        if (mods.FluxDispatcher) {
                            try {
                                mods.FluxDispatcher.dispatch({
                                    type: 'QUESTS_CLAIM_REWARD_SUCCESS',
                                    questId: questId,
                                    platform: plat,
                                    entitlements: res.body
                                });
                            } catch (e) {}
                        }
                        await syncQuestsStoreFromServer(mods);
                        setQuestLog(`Claimed: ${questName}!`, '#23a55a');
                        await refreshQuestListDisplay(true);
                        return;
                    }
                } catch (innerErr) {}
            }
            navigateDiscordToRoute(`/quests/${questId}`);
            setQuestLog(`Opened ${questName} to claim`, '#23a55a');
        } catch (err) {
            navigateDiscordToRoute('/quest-home');
            setQuestLog(`Opened Quests page to claim`, '#f0b232');
        }
    }

    async function refreshQuestListDisplay(forceApi = false) {
        const listEl = document.getElementById('lc-quest-list');
        if (!listEl) return;

        const { mods, enrolled, unEnrolled, claimable } = await fetchAllQuestsFromStoreOrApi(forceApi);
        const isReady = !!(mods.QuestsStore || mods.api);

        let avgPct = currentQuestPercent;
        if (!questRunnerActive) {
            if (enrolled.length > 0) {
                const first = enrolled[0];
                const t = first.taskData.target || 900;
                const d = getQuestTaskProgressSeconds(first.quest, first.taskName);
                avgPct = t > 0 ? Math.min(100, Math.round((d / t) * 100)) : 0;
            } else {
                avgPct = 0;
            }
        }
        updateFabProgressSummary(enrolled.length + unEnrolled.length, avgPct);

        if (window.__lcSyncCurrentAccountQuestCount) {
            window.__lcSyncCurrentAccountQuestCount(enrolled.length + unEnrolled.length);
        }

        if (!isReady) {
            listEl.innerHTML = `<div style='color:#f0b232;padding:6px 0;font-size:12px;'>Connecting to Discord... Click <b>Start</b> when loaded.</div>`;
            return;
        }
        if (enrolled.length === 0 && unEnrolled.length === 0 && claimable.length === 0) {
            listEl.innerHTML = `<div style='color:#949ba4;padding:6px 0;font-size:12px;'>No active quests found. Click <b>Start</b> to scan &amp; run quests.</div>`;
            return;
        }

        const getQuestKindBadgeMeta = (taskName) => {
            if (taskName === 'WATCH_VIDEO' || taskName === 'WATCH_VIDEO_ON_MOBILE') {
                return { text: 'VIDEO', bg: 'rgba(88, 101, 242, 0.14)', border: 'rgba(88, 101, 242, 0.28)', color: '#a5b4fc' };
            }
            if (taskName === 'PLAY_ACTIVITY') {
                return { text: 'ACTIVITY', bg: 'rgba(255, 255, 255, 0.06)', border: 'rgba(255, 255, 255, 0.12)', color: '#dbdee1' };
            }
            if (taskName === 'STREAM_ON_DESKTOP') {
                return { text: 'STREAM', bg: 'rgba(88, 101, 242, 0.14)', border: 'rgba(88, 101, 242, 0.28)', color: '#a5b4fc' };
            }
            if (taskName === 'PLAY_ON_XBOX' || taskName === 'PLAY_ON_PLAYSTATION') {
                return { text: 'CONSOLE', bg: 'rgba(255, 255, 255, 0.06)', border: 'rgba(255, 255, 255, 0.12)', color: '#b5bac1' };
            }
            return { text: 'GAME', bg: 'rgba(88, 101, 242, 0.14)', border: 'rgba(88, 101, 242, 0.28)', color: '#a5b4fc' };
        };

        const resolveQuestPreviewCandidates = (qObj) => {
            const urls = [];
            const addUrl = (u) => {
                if (!u || typeof u !== 'string') return;
                const clean = u.trim();
                if (!clean || clean.includes('.mp4') || clean.includes('.webm') || clean.includes('.mov')) return;
                if (!urls.includes(clean)) urls.push(clean);
            };
            try {
                for (const domImg of document.querySelectorAll('img')) {
                    const s = domImg.currentSrc || domImg.src || '';
                    if (s && !s.startsWith('data:') && (s.includes(String(qObj.id)) || (qObj.applicationId && s.includes(String(qObj.applicationId))))) {
                        addUrl(s);
                    }
                }
                const raw = qObj?.raw || {};
                const cfgO = raw.config || raw || {};
                const assets = cfgO.assets || {};
                const rawCandidates = [
                    assets.gameTile, assets.game_tile,
                    assets.questBarHero, assets.quest_bar_hero,
                    assets.hero, assets.logotype,
                    assets.rewardTile, assets.reward_tile
                ];
                for (const cand of rawCandidates) {
                    if (!cand || typeof cand !== 'string') continue;
                    const c = cand.trim();
                    if (!c || /\.(mp4|webm|mov)(\?|$)/i.test(c)) continue;
                    if (c.startsWith('http://') || c.startsWith('https://')) {
                        addUrl(c);
                    } else {
                        const stripped = c.replace(/^\/+/, '');
                        if (stripped.startsWith('quests/')) {
                            addUrl(`https://cdn.discordapp.com/${stripped}`);
                            addUrl(`https://media.discordapp.net/${stripped}`);
                        } else {
                            addUrl(`https://cdn.discordapp.com/quests/${qObj.id}/${stripped}`);
                            addUrl(`https://media.discordapp.net/quests/${qObj.id}/${stripped}`);
                            addUrl(`https://cdn.discordapp.com/${stripped}`);
                        }
                    }
                }
                const appIcon = cfgO.application?.icon;
                const appId = cfgO.application?.id || qObj.applicationId;
                if (appId && appIcon) {
                    addUrl(`https://cdn.discordapp.com/app-icons/${appId}/${appIcon}.png?size=128`);
                }
            } catch (e) {}
            return urls;
        };

        const renderQuestRowCard = (item, rightHtml, rowBg, rowBorder) => {
            const bMeta = getQuestKindBadgeMeta(item.taskName);
            const candidates = resolveQuestPreviewCandidates(item.quest);
            const firstUrl = candidates.length > 0 ? candidates[0] : '';
            const restUrls = candidates.length > 1 ? candidates.slice(1).join('|') : '';
            const isVideoTask = (item.taskName === 'WATCH_VIDEO' || item.taskName === 'WATCH_VIDEO_ON_MOBILE');
            const fallbackIcon = isVideoTask ? MSR.play : MSR.target;

            const imgTagHtml = firstUrl
                ? `<img class='lc-quest-preview-img' src='${firstUrl}' data-alt-urls='${restUrls}' alt='' draggable='false' style='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none !important;user-select:none;opacity:0;display:block;' />`
                : '';

            const thumbHtml = `<div style='width:42px;height:42px;border-radius:8px;overflow:hidden;flex-shrink:0;background:linear-gradient(135deg, rgba(88,101,242,0.28), rgba(30,31,34,0.95));border:1px solid ${bMeta.border};pointer-events:none !important;user-select:none;position:relative;display:flex;align-items:center;justify-content:center;color:#f2f3f5;'>
                <span style='display:flex;pointer-events:none !important;'>${fallbackIcon}</span>
                ${imgTagHtml}
            </div>`;

            return `<div data-qrow-id='${item.quest.id}' style='padding:8px 10px;background:${rowBg};border:1px solid ${rowBorder};border-radius:8px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;'>
                <div style='display:flex;align-items:center;gap:10px;min-width:0;flex:1;pointer-events:none !important;'>
                    ${thumbHtml}
                    <div style='min-width:0;flex:1;'>
                        <div style='color:#f2f3f5;font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px;'>${item.quest.name}</div>
                        <div style='display:flex;align-items:center;gap:5px;flex-wrap:wrap;'>
                            <span style='font-size:9.5px;font-weight:800;letter-spacing:0.3px;padding:1.5px 6px;border-radius:4px;background:${bMeta.bg};border:1px solid ${bMeta.border};color:${bMeta.color};'>${bMeta.text}</span>
                            <span style='font-size:10px;font-weight:600;padding:1.5px 6px;border-radius:4px;background:rgba(255,255,255,0.07);color:#dbdee1;'>${item.rewardCategoryLabel}</span>
                        </div>
                    </div>
                </div>
                ${rightHtml}
            </div>`;
        };

        const itemBgColor = '#26282d';
        const itemBorderColor = 'rgba(255, 255, 255, 0.05)';

        let html = '';
        for (const item of enrolled) {
            const target = item.taskData.target || 900;
            const done = getQuestTaskProgressSeconds(item.quest, item.taskName);
            const rightSpan = `<span data-qprog-id='${item.quest.id}' style='color:#dbdee1;font-size:11.5px;font-weight:700;flex-shrink:0;'>${done}/${target}s</span>`;
            html += renderQuestRowCard(item, rightSpan, itemBgColor, itemBorderColor);
        }
        for (const item of unEnrolled) {
            const rightSpan = `<span data-qprog-id='${item.quest.id}' style='color:#f0b232;font-size:11.5px;font-weight:700;flex-shrink:0;'>New</span>`;
            html += renderQuestRowCard(item, rightSpan, '#26282d', 'rgba(255, 255, 255, 0.05)');
        }
        for (const item of claimable) {
            const claimBtn = `<button class='lc-claim-quest-btn' data-qid='${item.quest.id}' data-qname='${item.quest.name.replace(/'/g, '')}' style='background:#23a55a;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;pointer-events:auto !important;'>Claim</button>`;
            html += renderQuestRowCard(item, claimBtn, '#26282d', 'rgba(88, 101, 242, 0.25)');
        }
        if (listEl.getAttribute('data-last-html') === html) {
            return;
        }
        const prevScrollTop = listEl.scrollTop;
        listEl.setAttribute('data-last-html', html);
        listEl.innerHTML = html;
        listEl.scrollTop = prevScrollTop;

        for (const pImg of listEl.querySelectorAll('.lc-quest-preview-img')) {
            pImg.addEventListener('load', () => { pImg.style.opacity = '1'; });
            pImg.addEventListener('error', () => {
                const rawAlts = pImg.getAttribute('data-alt-urls') || '';
                const parts = rawAlts ? rawAlts.split('|').filter(Boolean) : [];
                if (parts.length > 0) {
                    const nextUrl = parts.shift();
                    pImg.setAttribute('data-alt-urls', parts.join('|'));
                    pImg.src = nextUrl;
                } else {
                    pImg.remove();
                }
            });
        }

        for (const cBtn of listEl.querySelectorAll('.lc-claim-quest-btn')) {
            cBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const qid = cBtn.getAttribute('data-qid');
                const qn = cBtn.getAttribute('data-qname') || 'Quest';
                if (qid) claimQuestReward(qid, qn);
            });
        }

        if (cfg.QuestAutoStart && !questRunnerActive && (enrolled.length > 0 || unEnrolled.length > 0)) {
            runQuestCompleterQueue();
        }
    }

    function cryptoRandFloat() {
        try {
            const arr = new Uint32Array(1);
            window.crypto.getRandomValues(arr);
            return (arr[0] >>> 0) / 4294967296;
        } catch (e) {
            return Math.random();
        }
    }

    function updateQuestMainActionButtonUI() {
        const mainBtn = document.getElementById('lc-q-main-btn');
        const iconSpan = document.getElementById('lc-q-main-btn-icon');
        const textSpan = document.getElementById('lc-q-main-btn-text');
        if (!mainBtn || !iconSpan || !textSpan) return;
        if (questRunnerActive && !questStopRequested) {
            mainBtn.style.background = '#23a55a';
            mainBtn.style.color = '#ffffff';
            iconSpan.innerHTML = MSR.stop;
            textSpan.textContent = 'Stop';
        } else {
            mainBtn.style.background = '#5865f2';
            mainBtn.style.color = '#ffffff';
            iconSpan.innerHTML = MSR.play;
            textSpan.textContent = 'Start';
        }
    }

    function patchRunningGameStoreForQuest(mods, fakeGame) {
        const S = mods?.RunningGameStore;
        if (!S || !fakeGame) return () => {};
        const methodNames = ['getRunningGames', 'getGameForPID', 'getVisibleGame', 'getVisibleRunningGames', 'getCandidateGames', 'getRunningDiscordApplicationIds'];
        const saved = {};
        for (const name of methodNames) {
            if (typeof S[name] === 'function') saved[name] = S[name];
        }
        let realGames = [];
        try { if (saved.getRunningGames) realGames = saved.getRunningGames.call(S) || []; } catch (e) {}
        const fakeGames = [...realGames.filter(g => g && g.pid !== fakeGame.pid), fakeGame];

        S.getRunningGames = () => fakeGames;
        if (saved.getGameForPID) S.getGameForPID = (p) => fakeGames.find(x => x.pid === p) || saved.getGameForPID.call(S, p);
        if (saved.getVisibleGame) S.getVisibleGame = () => fakeGame;
        if (saved.getVisibleRunningGames) S.getVisibleRunningGames = () => fakeGames;
        if (saved.getCandidateGames) S.getCandidateGames = () => fakeGames;
        if (saved.getRunningDiscordApplicationIds) S.getRunningDiscordApplicationIds = () => [String(fakeGame.id)];

        if (mods.FluxDispatcher) {
            try { mods.FluxDispatcher.dispatch({ type: 'RUNNING_GAMES_CHANGE', removed: [], added: [fakeGame], games: fakeGames }); } catch (e) {}
        }
        let restored = false;
        return () => {
            if (restored) return;
            restored = true;
            for (const [name, fn] of Object.entries(saved)) {
                try { S[name] = fn; } catch (e) {}
            }
            if (mods.FluxDispatcher) {
                try { mods.FluxDispatcher.dispatch({ type: 'RUNNING_GAMES_CHANGE', removed: [fakeGame], added: [], games: realGames }); } catch (e) {}
            }
        };
    }

    function formatCountdownMinutesSeconds(totalSec) {
        const s = Math.max(0, Math.floor(totalSec));
        if (s >= 60) {
            const m = Math.floor(s / 60);
            const rem = s % 60;
            return `${m}m ${rem}s`;
        }
        return `${s}s`;
    }

    // Shows the status label on the left and the countdown timer ONLY ONCE in the right pill badge!
    function setQuestCooldownBanner(visible, statusLabelText, secondsLeft, isCooldownBetweenQuests = false) {
        const banner = document.getElementById('lc-quest-cooldown-banner');
        const txt = document.getElementById('lc-quest-cooldown-text');
        const pill = document.getElementById('lc-quest-cooldown-pill');
        if (!banner || !txt || !pill) return;
        if (!visible) {
            banner.style.display = 'none';
            return;
        }
        banner.style.display = 'flex';
        if (isCooldownBetweenQuests) {
            banner.style.background = 'rgba(240, 178, 50, 0.16)';
            banner.style.borderColor = 'rgba(240, 178, 50, 0.42)';
            banner.style.color = '#f0b232';
            pill.style.background = 'rgba(240, 178, 50, 0.28)';
            pill.style.color = '#ffffff';
        } else {
            banner.style.background = 'rgba(88, 101, 242, 0.14)';
            banner.style.borderColor = 'rgba(88, 101, 242, 0.34)';
            banner.style.color = '#a5b4fc';
            pill.style.background = 'rgba(88, 101, 242, 0.28)';
            pill.style.color = '#ffffff';
        }
        txt.textContent = statusLabelText;
        pill.textContent = formatCountdownMinutesSeconds(secondsLeft);
    }

    function updateQuestRowsActiveAndInactiveVisualState(activeQuestId, isCoolingDown) {
        const listEl = document.getElementById('lc-quest-list');
        if (!listEl) return;
        for (const row of listEl.querySelectorAll('[data-qrow-id]')) {
            const qid = row.getAttribute('data-qrow-id');
            const progSpan = row.querySelector('[data-qprog-id]');
            if (isCoolingDown) {
                row.style.opacity = '0.42';
                row.style.filter = 'grayscale(0.65)';
                row.style.borderColor = 'rgba(240, 178, 50, 0.22)';
                if (progSpan && qid === activeQuestId) {
                    progSpan.textContent = 'Queued';
                    progSpan.style.color = '#f0b232';
                }
            } else if (activeQuestId) {
                if (qid === activeQuestId) {
                    row.style.opacity = '1';
                    row.style.filter = 'none';
                    row.style.borderColor = 'rgba(35, 165, 90, 0.48)';
                    if (progSpan) progSpan.style.color = '#23a55a';
                } else {
                    row.style.opacity = '0.45';
                    row.style.filter = 'grayscale(0.55)';
                    row.style.borderColor = 'rgba(255, 255, 255, 0.04)';
                }
            } else {
                row.style.opacity = '1';
                row.style.filter = 'none';
                row.style.borderColor = 'rgba(255, 255, 255, 0.05)';
            }
        }
    }

    async function runQuestCompleterQueue() {
        if (questRunnerActive) return;
        questRunnerActive = true;
        questStopRequested = false;
        updateQuestMainActionButtonUI();
        setQuestStatusDot('active');
        setQuestLog('Scanning quests...', '#dbdee1');
        setQuestCooldownBanner(false, '', 0);

        try {
            while (!questStopRequested && cfg.QuestHelperEnabled) {
                let { mods, enrolled, unEnrolled } = await fetchAllQuestsFromStoreOrApi(true);
                if (!mods.api) {
                    setQuestLog('Waiting for Discord auth token...', '#f23f43', true);
                    break;
                }
                if (enrolled.length + unEnrolled.length === 0) {
                    setQuestStatusDot('paused');
                    setQuestLog('All eligible quests completed!', '#23a55a');
                    setQuestCooldownBanner(false, '', 0);
                    refreshQuestListDisplay(false);
                    break;
                }

                // Select a random batch of 2 to 5 quests at a time from the available list!
                const batchSizeLimit = Math.floor(2 + cryptoRandFloat() * 4); // 2, 3, 4, or 5

                if (enrolled.length < batchSizeLimit && unEnrolled.length > 0) {
                    const needed = Math.min(unEnrolled.length, batchSizeLimit - enrolled.length);
                    for (let i = 0; i < needed; i++) {
                        if (questStopRequested || !cfg.QuestHelperEnabled) break;
                        const u = unEnrolled[i];
                        try {
                            setQuestLog(`Activating: ${u.quest.name}...`, '#dbdee1');
                            const enrollBody = (cfg.QuestDesktopByDefault !== false)
                                ? { location: 11, is_targeted: false, platform: 0 }
                                : { location: 11, is_targeted: false };
                            const enrollRes = await mods.api.post({ url: `/quests/${u.quest.id}/enroll`, body: enrollBody });
                            u.quest.enrolledAt = enrollRes?.body?.enrolled_at || new Date().toISOString();
                            if (enrollRes?.body) dispatchQuestStatusToDiscord(mods, u.quest.id, enrollRes.body);
                            await new Promise(r => setTimeout(r, Math.floor(1100 + cryptoRandFloat() * 900)));
                            enrolled.push(u);
                        } catch (e) {}
                    }
                }

                const currentBatch = enrolled.slice(0, batchSizeLimit);
                if (currentBatch.length === 0) break;

                await refreshQuestListDisplay(false);

                if (cfg.QuestAutoCollapseFab && !cfg.QuestOnlyModeActive && !isQuestCollapsed) {
                    setQuestCollapsedState(true);
                }

                // Complete these 2-5 quests one after another continuously
                for (let bIdx = 0; bIdx < currentBatch.length; bIdx++) {
                    if (questStopRequested || !cfg.QuestHelperEnabled) break;
                    const item = currentBatch[bIdx];
                    const { quest, taskName, taskData, appId, typeAndRewardText } = item;
                    const questName = quest.name;
                    const questTypeSub = `${typeAndRewardText || getFriendlyQuestTaskLabel(taskName)} • Batch ${bIdx + 1}/${currentBatch.length}`;
                    const secondsNeeded = taskData.target || 900;
                    let secondsDone = getQuestTaskProgressSeconds(quest, taskName);

                    setQuestStatusDot('active');
                    setQuestCooldownBanner(false, '', 0);
                    setQuestProgressUI(questName, secondsDone, secondsNeeded, questTypeSub);
                    updateLiveQuestRowProgress(quest.id, secondsDone, secondsNeeded);
                    updateQuestRowsActiveAndInactiveVisualState(quest.id, false);

                    if (taskName === 'WATCH_VIDEO' || taskName === 'WATCH_VIDEO_ON_MOBILE') {
                        while (!questStopRequested && cfg.QuestHelperEnabled) {
                            const waitTotalSec = Math.floor(7 + cryptoRandFloat() * 2);
                            for (let rem = waitTotalSec; rem > 0; rem--) {
                                if (questStopRequested || !cfg.QuestHelperEnabled) break;
                                setQuestCooldownBanner(true, 'Syncing video progress...', rem, false);
                                await new Promise(r => setTimeout(r, 1000));
                            }
                            setQuestCooldownBanner(false, '', 0);
                            if (questStopRequested || !cfg.QuestHelperEnabled) break;
                            const stepAdvance = 6.8 + cryptoRandFloat() * 1.4;
                            const nextTimestamp = Number(Math.min(secondsNeeded, secondsDone + stepAdvance).toFixed(3));
                            try {
                                const res = await mods.api.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: nextTimestamp } });
                                const parsed = extractServerQuestProgress(res?.body, taskName, Math.floor(nextTimestamp));
                                secondsDone = Math.min(secondsNeeded, parsed.hasServerValue ? parsed.value : Math.floor(nextTimestamp));
                                dispatchQuestStatusToDiscord(mods, quest.id, parsed.userStatus);
                                setQuestProgressUI(questName, secondsDone, secondsNeeded, questTypeSub);
                                updateLiveQuestRowProgress(quest.id, secondsDone, secondsNeeded);
                                updateQuestRowsActiveAndInactiveVisualState(quest.id, false);
                                if (parsed.completedAt != null) break;
                                if (secondsDone >= secondsNeeded) {
                                    await new Promise(r => setTimeout(r, 1500));
                                    const finalRes = await mods.api.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: secondsNeeded } });
                                    const finalParsed = extractServerQuestProgress(finalRes?.body, taskName, secondsNeeded);
                                    dispatchQuestStatusToDiscord(mods, quest.id, finalParsed.userStatus);
                                    break;
                                }
                            } catch (err) { break; }
                        }
                        await syncQuestsStoreFromServer(mods);
                    } else {
                        const resolvedAppIdStr = appId ? String(appId) : String(quest.applicationId || quest.id);
                        const pid = (Math.floor(cryptoRandFloat() * 10000) + 2500) * 4;
                        const fakeGame = {
                            cmdLine: `C:\\Program Files\\DiscordGame\\game.exe`,
                            exeName: 'game.exe',
                            exePath: 'c:/program files/discordgame/game.exe',
                            executables: [{ os: 'win32', name: 'game.exe', is_launcher: false }],
                            id: resolvedAppIdStr,
                            name: questName,
                            pid: pid,
                            pidPath: [pid],
                            processName: questName,
                            start: Date.now() - 5000
                        };
                        const restoreSpoof = patchRunningGameStoreForQuest(mods, fakeGame);
                        let channelId = mods.ChannelStore?.getSortedPrivateChannels?.()?.[0]?.id || '1';
                        const fallbackStreamKey = `call:${channelId}:1`;
                        let activeHbBody = (taskName === 'STREAM_ON_DESKTOP' || taskName === 'PLAY_ACTIVITY')
                            ? { stream_key: fallbackStreamKey, application_id: resolvedAppIdStr, terminal: false }
                            : { application_id: resolvedAppIdStr, terminal: false };

                        try {
                            while (!questStopRequested && cfg.QuestHelperEnabled && secondsDone < secondsNeeded) {
                                try {
                                    let res = null;
                                    try {
                                        res = await mods.api.post({ url: `/quests/${quest.id}/heartbeat`, body: activeHbBody });
                                    } catch (firstErr) {
                                        if (firstErr && (firstErr.status === 400 || firstErr.status === 422)) {
                                            const altBody = activeHbBody.stream_key
                                                ? { application_id: resolvedAppIdStr, terminal: false }
                                                : { stream_key: fallbackStreamKey, application_id: resolvedAppIdStr, terminal: false };
                                            res = await mods.api.post({ url: `/quests/${quest.id}/heartbeat`, body: altBody });
                                            activeHbBody = altBody;
                                        } else {
                                            throw firstErr;
                                        }
                                    }
                                    const parsed = extractServerQuestProgress(res?.body, taskName, secondsDone);
                                    if (parsed.hasServerValue) secondsDone = Math.min(secondsNeeded, parsed.value);
                                    dispatchQuestStatusToDiscord(mods, quest.id, parsed.userStatus);
                                    setQuestProgressUI(questName, secondsDone, secondsNeeded, questTypeSub);
                                    updateLiveQuestRowProgress(quest.id, secondsDone, secondsNeeded);
                                    updateQuestRowsActiveAndInactiveVisualState(quest.id, false);
                                    if (parsed.completedAt != null || secondsDone >= secondsNeeded) {
                                        try {
                                            const termRes = await mods.api.post({ url: `/quests/${quest.id}/heartbeat`, body: Object.assign({}, activeHbBody, { terminal: true }) });
                                            const termParsed = extractServerQuestProgress(termRes?.body, taskName, secondsNeeded);
                                            dispatchQuestStatusToDiscord(mods, quest.id, termParsed.userStatus);
                                        } catch (e) {}
                                        await syncQuestsStoreFromServer(mods);
                                        break;
                                    }
                                } catch (hbErr) { break; }

                                const hbIntervalSec = Math.floor(19 + cryptoRandFloat() * 5);
                                for (let rem = hbIntervalSec; rem > 0; rem--) {
                                    if (questStopRequested || !cfg.QuestHelperEnabled || secondsDone >= secondsNeeded) break;
                                    setQuestCooldownBanner(true, 'Syncing progress...', rem, false);
                                    await new Promise(r => setTimeout(r, 1000));
                                }
                                setQuestCooldownBanner(false, '', 0);
                            }
                        } finally {
                            restoreSpoof();
                        }
                    }

                    await refreshQuestListDisplay(true);

                    // After each quest in the 2-5 quest batch completes: wait a random 15-60 seconds before running the next quest!
                    if (bIdx + 1 < currentBatch.length && !questStopRequested && cfg.QuestHelperEnabled) {
                        const nextQuestObj = currentBatch[bIdx + 1]?.quest;
                        const nextQuestName = nextQuestObj?.name || 'Next Quest';
                        const randomInterQuestSec = Math.floor(15 + cryptoRandFloat() * 46); // 15 to 60 seconds
                        setQuestStatusDot('paused');
                        for (let cd = randomInterQuestSec; cd > 0; cd--) {
                            if (questStopRequested || !cfg.QuestHelperEnabled) break;
                            setQuestLog(`Next: ${nextQuestName}`, '#f0b232');
                            setQuestCooldownBanner(
                                true,
                                'Next quest cooldown — Quests paused',
                                cd,
                                true
                            );
                            updateQuestRowsActiveAndInactiveVisualState(nextQuestObj?.id || '', true);
                            await new Promise(r => setTimeout(r, 1000));
                        }
                        setQuestCooldownBanner(false, '', 0);
                    }
                }

                // Check if more eligible quests remain after finishing this batch of 2-5 quests
                if (questStopRequested || !cfg.QuestHelperEnabled) break;
                const remainingCheck = await fetchAllQuestsFromStoreOrApi(true);
                const remainingTotal = remainingCheck.enrolled.length + remainingCheck.unEnrolled.length;
                if (remainingTotal === 0) {
                    setQuestStatusDot('paused');
                    setQuestLog('All quests completed!', '#23a55a');
                    setQuestCooldownBanner(false, '', 0);
                    break;
                }

                // Batch of 2-5 quests finished and more quests remain: wait a random 1-4 minutes (60-240 seconds) before selecting next 2-5 quests!
                const batchRestSec = Math.floor(60 + cryptoRandFloat() * 181); // 60 to 240 seconds (1 to 4 minutes)
                setQuestStatusDot('paused');
                for (let br = batchRestSec; br > 0; br--) {
                    if (questStopRequested || !cfg.QuestHelperEnabled) break;
                    setQuestLog(`Batch cooldown (${remainingTotal} remaining)`, '#f0b232');
                    setQuestCooldownBanner(
                        true,
                        'Batch cooldown — Quests paused',
                        br,
                        true
                    );
                    updateQuestRowsActiveAndInactiveVisualState(remainingCheck.enrolled[0]?.quest?.id || '', true);
                    await new Promise(r => setTimeout(r, 1000));
                }
                setQuestCooldownBanner(false, '', 0);
            }
        } finally {
            questRunnerActive = false;
            questStopRequested = false;
            setQuestCooldownBanner(false, '', 0);
            updateQuestMainActionButtonUI();
            if (questStateStatus !== 'error') setQuestStatusDot('paused');
            refreshQuestListDisplay(true);
            sendHost('TRIM_MEMORY');
        }
    }

    function createQuestCompleterHud() {
        if (!document.body || !document.head) return;
        const existing = document.getElementById('litecord-quest-hud');
        if (existing) {
            questHud = existing;
            return;
        }
        questHud = document.createElement('div');
        questHud.id = 'litecord-quest-hud';
        savedExpandedLeft = -1;
        savedExpandedTop = -1;
        questHud.style.cssText = `
            position: fixed;
            bottom: 16px; right: 16px; left: auto; top: auto;
            z-index: 2147483646; font-size: 13px; line-height: 1.45;
            display: ${cfg.QuestHelperEnabled ? 'block' : 'none'}; user-select: none;
        `;

        const initListHeight = Math.max(110, Math.min(620, Number(cfg.QuestHudListHeight) || 170));
        questHud.innerHTML = `
            <div id='lc-quest-expanded-card' style='position:relative;display:flex;flex-direction:column;'>
                <div id='lc-quest-vresize-top' title='Drag up or down to vertically resize Quest Completer' style='height:6px;margin:-8px -6px 4px -6px;cursor:ns-resize;display:flex;align-items:center;justify-content:center;'>
                    <div style='width:38px;height:3px;border-radius:999px;background:rgba(255,255,255,0.16);'></div>
                </div>
                <div id='lc-quest-drag-header' style='display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:8px;margin-bottom:10px;cursor:grab;flex-shrink:0;'>
                    <div style='display:flex;align-items:center;gap:8px;'>
                        <span id='lc-quest-hdr-dot' style='width:9px;height:9px;border-radius:50%;background:#f0b232;flex-shrink:0;'></span>
                        <strong style='color:#f2f3f5;font-size:14px;font-weight:700;'>Quests</strong>
                        <span style='font-size:10.5px;padding:1.5px 6px;border-radius:5px;background:#232428;color:#949ba4;font-weight:600;'>v0.6.6</span>
                    </div>
                    <div style='display:flex;gap:5px;align-items:center;'>
                        <button id='lc-q-vexpand-btn' title='Toggle Vertical Expand' style='background:#232428;border:none;border-radius:6px;width:26px;height:24px;color:#dbdee1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;'>${MSR.expand}</button>
                        <button id='lc-q-min' title='Minimize to Pill' style='background:#232428;border:none;border-radius:6px;width:26px;height:24px;color:#dbdee1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;'>${MSR.winMin}</button>
                        <button id='lc-q-close' title='Hide Quests' style='background:transparent;border:none;color:#8e9297;cursor:pointer;width:26px;height:24px;display:inline-flex;align-items:center;justify-content:center;'>${MSR.winClose}</button>
                    </div>
                </div>
                <div id='lc-quest-main-view' style='display:flex;flex-direction:column;flex:1;min-height:0;'>
                    <div id='lc-quest-hud-filters' style='display:flex;align-items:center;gap:5px;margin-bottom:9px;padding:5px 7px;background:#202225;border:1px solid rgba(255,255,255,0.06);border-radius:8px;flex-shrink:0;'>
                        <span style='font-size:10px;font-weight:700;color:#80848e;text-transform:uppercase;margin-right:2px;'>Filter</span>
                        <button class='lc-q-hud-fchip active' data-qfilter='orbs'>Orbs</button>
                        <button class='lc-q-hud-fchip active' data-qfilter='frames'>Frames</button>
                        <button class='lc-q-hud-fchip active' data-qfilter='ads'>Ads</button>
                        <button class='lc-q-hud-fchip active' data-qfilter='codes'>Codes</button>
                        <button class='lc-q-hud-fchip active' data-qfilter='nitro'>Nitro</button>
                    </div>
                    <div id='lc-quest-list' style='max-height:${initListHeight}px;overflow-y:auto;margin-bottom:9px;font-size:12.5px;flex:1;'>
                        Scanning Quests...
                    </div>
                    <div id='lc-quest-cooldown-banner' style='display:none;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;margin-bottom:8px;border-radius:7px;background:rgba(240,178,50,0.14);border:1px solid rgba(240,178,50,0.38);color:#f0b232;font-size:11.5px;font-weight:600;'>
                        <span id='lc-quest-cooldown-text'>Next quest in 10s...</span>
                        <span id='lc-quest-cooldown-pill' style='background:rgba(240,178,50,0.22);color:#fff;padding:1.5px 7px;border-radius:999px;font-size:10.5px;font-weight:700;'>10s</span>
                    </div>
                    <div style='margin-bottom:10px;'>
                        <div style='display:flex;justify-content:space-between;align-items:flex-start;font-size:12px;margin-bottom:6px;'>
                            <div style='min-width:0;max-width:225px;'>
                                <div id='lc-quest-active-title' style='color:#949ba4;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>Ready</div>
                                <div id='lc-quest-active-type' style='display:none;color:#949ba4;font-size:11px;margin-top:2px;'></div>
                            </div>
                            <span id='lc-quest-pct' style='color:#dbdee1;font-weight:700;flex-shrink:0;'>0%</span>
                        </div>
                        <div style='width:100%;height:7px;background:#232428;border-radius:999px;overflow:hidden;'>
                            <div id='lc-quest-bar-fill' style='width:0%;height:100%;border-radius:999px;background:#23a55a;'></div>
                        </div>
                    </div>
                    <div style='display:flex;align-items:center;gap:7px;'>
                        <button id='lc-q-main-btn' style='flex:1;height:34px;background:#5865f2;color:#ffffff;border:none;border-radius:8px;padding:0 12px;cursor:pointer;font-weight:700;font-size:12.5px;display:flex;align-items:center;justify-content:center;gap:6px;'>
                            <span id='lc-q-main-btn-icon' style='display:flex;'>${MSR.play}</span>
                            <span id='lc-q-main-btn-text'>Start</span>
                        </button>
                        <button id='lc-q-more-settings' title='Open Quest Settings' style='width:36px;height:34px;flex-shrink:0;background:#232428;color:#dbdee1;border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;'>
                            ${MSR.tune}
                        </button>
                    </div>
                </div>
                <div id='lc-quest-vresize-bottom' title='Drag up or down to vertically resize Quest Completer' style='height:7px;margin:5px -6px -8px -6px;cursor:ns-resize;display:flex;align-items:center;justify-content:center;flex-shrink:0;'>
                    <div style='width:38px;height:3px;border-radius:999px;background:rgba(255,255,255,0.16);'></div>
                </div>
            </div>
            <div id='lc-quest-fab-pill'>
                <span id='lc-fab-dot' style='width:9px;height:9px;border-radius:50%;background:#f0b232;'></span>
                <span id='lc-fab-count' style='font-size:12.5px;font-weight:700;color:#f2f3f5;'>0 Quests</span>
                <div style='width:58px;height:6px;background:#2b2d31;border-radius:999px;overflow:hidden;'>
                    <div id='lc-fab-bar-fill' style='width:0%;height:100%;background:#23a55a;border-radius:999px;'></div>
                </div>
                <span id='lc-fab-pct' style='font-size:12px;font-weight:700;color:#dbdee1;'>0%</span>
            </div>
        `;
        document.body.appendChild(questHud);

        const saveQuestPos = (x, y) => {
            if (!isQuestCollapsed && !cfg.QuestOnlyModeActive) {
                savedExpandedLeft = x;
                savedExpandedTop = y;
                sendHost(`SAVE_QUEST_POS:${x},${y}`);
            }
        };
        makeElementDraggable(questHud, document.getElementById('lc-quest-drag-header'), null, saveQuestPos);
        makeElementDraggable(questHud, document.getElementById('lc-quest-fab-pill'), () => setQuestCollapsedState(false), null);

        document.getElementById('lc-q-min').addEventListener('click', (e) => {
            e.stopPropagation();
            if (cfg.QuestOnlyModeActive) return;
            setQuestCollapsedState(true);
        });
        document.getElementById('lc-q-close').addEventListener('click', (e) => {
            e.stopPropagation();
            questStopRequested = true;
            questHud.style.display = 'none';
            sendHost('DISABLE_QUEST_HELPER');
        });
        for (const chip of questHud.querySelectorAll('.lc-q-hud-fchip')) {
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                const fk = chip.getAttribute('data-qfilter');
                if (fk === 'orbs') sendHost('TOGGLE_QFILTER_ORBS');
                else if (fk === 'frames') sendHost('TOGGLE_QFILTER_FRAMES');
                else if (fk === 'ads') sendHost('TOGGLE_QFILTER_ADS');
                else if (fk === 'codes') sendHost('TOGGLE_QFILTER_CODES');
                else if (fk === 'nitro') sendHost('TOGGLE_QFILTER_NITRO');
            });
        }
        document.getElementById('lc-q-main-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (questRunnerActive) {
                questStopRequested = true;
                questRunnerActive = false;
                updateQuestMainActionButtonUI();
                setQuestStatusDot('paused');
                setQuestLog('Stopped', '#f0b232');
            } else {
                await refreshQuestListDisplay(true);
                runQuestCompleterQueue();
            }
        });
        document.getElementById('lc-q-more-settings').addEventListener('click', (e) => {
            e.stopPropagation();
            window.__litecordToggleMenu();
            switchMenuTab('quests');
        });

        const qListEl = document.getElementById('lc-quest-list');
        const vTop = document.getElementById('lc-quest-vresize-top');
        const vBot = document.getElementById('lc-quest-vresize-bottom');
        const vExpBtn = document.getElementById('lc-q-vexpand-btn');

        if (vExpBtn && qListEl) {
            vExpBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (cfg.QuestOnlyModeActive) return;
                const curH = parseInt(qListEl.style.maxHeight || '170', 10) || 170;
                const nextH = curH < 320 ? 380 : 160;
                qListEl.style.maxHeight = nextH + 'px';
                cfg.QuestHudListHeight = nextH;
                persistPanelSizesNow();
            });
        }

        const attachVerticalResizer = (gripEl, invertDelta) => {
            if (!gripEl || !qListEl) return;
            gripEl.addEventListener('mousedown', (e) => {
                if (cfg.QuestOnlyModeActive) return;
                e.preventDefault();
                e.stopPropagation();
                const startY = e.clientY;
                const startH = qListEl.getBoundingClientRect().height || parseInt(qListEl.style.maxHeight || '170', 10) || 170;
                const onMove = (me) => {
                    const dy = me.clientY - startY;
                    const delta = invertDelta ? -dy : dy;
                    const newH = Math.max(96, Math.min(window.innerHeight - 210, Math.round(startH + delta)));
                    qListEl.style.maxHeight = newH + 'px';
                    cfg.QuestHudListHeight = newH;
                };
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove, true);
                    window.removeEventListener('mouseup', onUp, true);
                    persistPanelSizesNow();
                };
                window.addEventListener('mousemove', onMove, true);
                window.addEventListener('mouseup', onUp, true);
            });
        };
        attachVerticalResizer(vTop, true);
        attachVerticalResizer(vBot, false);
        updateQuestMainActionButtonUI();
    }

    // ------------------------------------------------------------------------
    // 5. DISLITE RUST v0.4.0 WORKSPACE & MULTI-ACCOUNT ENGINE
    // ------------------------------------------------------------------------
    let leftAccountsPanel = null;
    let leftPanelResizer = null;
    let rightPanelResizer = null;
    let loginBackFab = null;
    let startupPromptModal = null;
    let accountSwitchModal = null;
    let hasShownStartupPromptThisSession = false;
    let previousActiveAccountToken = '';
    let previousActiveAccountName = '';
    let isFetchingCurrentUserApi = false;

    function loadSavedPanelSizesIntoCfg() {
        try {
            if (earlyLocalStorage) {
                const raw = earlyLocalStorage.getItem('__lc_panel_sizes');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        if (typeof parsed.leftW === 'number' && parsed.leftW >= 60 && parsed.leftW <= 460) cfg.LeftAccountsPanelWidth = Math.round(parsed.leftW);
                        if (typeof parsed.rightW === 'number' && parsed.rightW >= 260 && parsed.rightW <= 620) cfg.RightQuestPanelWidth = Math.round(parsed.rightW);
                        if (typeof parsed.listH === 'number' && parsed.listH >= 80 && parsed.listH <= 720) cfg.QuestHudListHeight = Math.round(parsed.listH);
                    }
                }
            }
        } catch (e) {}
    }

    function persistPanelSizesNow() {
        const lw = Math.round(Number(cfg.LeftAccountsPanelWidth) || 240);
        const rw = Math.round(Number(cfg.RightQuestPanelWidth) || 352);
        const lh = Math.round(Number(cfg.QuestHudListHeight) || 170);
        cfg.LeftAccountsPanelWidth = lw;
        cfg.RightQuestPanelWidth = rw;
        cfg.QuestHudListHeight = lh;
        try {
            if (earlyLocalStorage) {
                earlyLocalStorage.setItem('__lc_panel_sizes', JSON.stringify({ leftW: lw, rightW: rw, listH: lh }));
            }
        } catch (e) {}
        sendHost(`SAVE_PANEL_SIZES:${lw},${rw},${lh}`);
    }

    loadSavedPanelSizesIntoCfg();

    function readActiveDiscordTokenFromStorage() {
        const tokFromAuth = getAuthToken();
        if (tokFromAuth && typeof tokFromAuth === 'string' && tokFromAuth.length > 15) {
            return tokFromAuth.replace(/^'+|'+$/g, '').trim();
        }
        try {
            if (earlyLocalStorage) {
                const raw = earlyLocalStorage.getItem('token');
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (typeof parsed === 'string' && parsed.length > 15) return parsed;
                    } catch (e2) {}
                    return raw.replace(/^'+|'+$/g, '').trim();
                }
            }
        } catch (e) {}
        return '';
    }

    function getCurrentDiscordUserObject() {
        try {
            scanReactFiberForStores();
            resolveDiscordModules();
            const uStore = discoveredStoresByName.get('UserStore') || window.Vencord?.Webpack?.Common?.UserStore;
            if (uStore && typeof uStore.getCurrentUser === 'function') {
                const u = uStore.getCurrentUser();
                if (u && u.id) return u;
            }
            for (const m of allLoadedModules.values()) {
                const ex = m?.exports;
                if (!ex || typeof ex !== 'object') continue;
                for (const k of ['default', 'Z', 'ZP', 'A', 'Ay']) {
                    try {
                        if (ex[k] && typeof ex[k].getCurrentUser === 'function') {
                            const u = ex[k].getCurrentUser();
                            if (u && u.id) return u;
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {}
        return null;
    }

    function readDiscordMultiAccountTokensMap() {
        const map = {};
        try {
            if (earlyLocalStorage) {
                const rawTokens = earlyLocalStorage.getItem('tokens');
                if (rawTokens) {
                    const parsed = JSON.parse(rawTokens);
                    if (parsed && typeof parsed === 'object') {
                        for (const [uid, tok] of Object.entries(parsed)) {
                            if (uid && typeof tok === 'string' && tok.length > 10) {
                                map[String(uid)] = tok;
                            }
                        }
                    }
                }
            }
        } catch (e) {}
        return map;
    }

    let lastMaScanTs = 0;
    function locateDiscordMultiAccountStore() {
        const existing = discoveredStoresByName.get('MultiAccountStore')
            || window.Vencord?.Webpack?.Common?.MultiAccountStore
            || window.Vencord?.Webpack?.findStore?.('MultiAccountStore');
        if (existing && typeof existing.getAccounts === 'function') {
            discoveredStoresByName.set('MultiAccountStore', existing);
            return existing;
        }
        if (Date.now() - lastMaScanTs < 15000 || !document.querySelector('nav[class*="guilds_"]')) return null;
        lastMaScanTs = Date.now();

        try {
            scanReactFiberForStores();
            resolveDiscordModules();
            const afterScan = discoveredStoresByName.get('MultiAccountStore');
            if (afterScan && typeof afterScan.getAccounts === 'function') return afterScan;

            const allMods = getAllWebpackModulesList();

            for (const m of allMods) {
                const exp = m && m.exports;
                if (!exp || typeof exp !== 'object') continue;
                for (const k of Object.keys(exp)) {
                    let val = null;
                    try { val = exp[k]; } catch { continue; }
                    if (!val || typeof val !== 'object') continue;
                    if (typeof val.getAccounts === 'function') {
                        discoveredStoresByName.set('MultiAccountStore', val);
                        return val;
                    }
                }
            }
        } catch (e) {}
        return null;
    }

    // Harvests all accounts logged into Discord's "Switch Accounts" menu (MultiAccountStore + UserStore + localStorage MultiAccountStore)
    function harvestDiscordMultiAccountStoreUsers() {
        const found = [];
        const tokensMap = readDiscordMultiAccountTokensMap();
        const uStore = discoveredStoresByName.get('UserStore') || window.Vencord?.Webpack?.Common?.UserStore;

        const addAcc = (id, username, globalName, avatarHash, tokenStatus) => {
            if (!id) return;
            if (typeof tokenStatus === 'number' && tokenStatus !== 0) return;
            const uid = String(id);
            if (found.some(x => x.UserId === uid)) return;

            let uName = String(username || '');
            let gName = String(globalName || '');
            let avHash = avatarHash || '';

            // Enrich from UserStore if available so username, display name & avatar match Discord's Switch Accounts popup
            if (uStore && typeof uStore.getUser === 'function') {
                try {
                    const uObj = uStore.getUser(uid);
                    if (uObj) {
                        if (!uName && uObj.username) uName = String(uObj.username);
                        if (!gName && (uObj.globalName || uObj.global_name)) gName = String(uObj.globalName || uObj.global_name);
                        if (!avHash && uObj.avatar) avHash = uObj.avatar;
                    }
                } catch (e) {}
            }

            const avUrl = avHash
                ? `https://cdn.discordapp.com/avatars/${uid}/${avHash}.png?size=128`
                : normalizeDiscordAvatarUrlToPng('', uid);

            found.push({
                UserId: uid,
                Username: uName,
                GlobalName: gName || uName || 'Discord Account',
                AvatarUrl: avUrl,
                Token: tokensMap[uid] || ''
            });
        };

        // 1. Live MultiAccountStore (used directly by Discord's "Switch Accounts" menu!)
        try {
            const maStore = locateDiscordMultiAccountStore();
            if (maStore) {
                const list = typeof maStore.getAccounts === 'function'
                    ? maStore.getAccounts()
                    : (typeof maStore.getUsers === 'function' ? maStore.getUsers() : (maStore._state?.users || []));
                if (Array.isArray(list)) {
                    for (const u of list) {
                        if (u && (u.id || u.userId)) {
                            addAcc(u.id || u.userId, u.username, u.globalName || u.global_name || u.username, u.avatar, u.tokenStatus);
                        }
                    }
                }
            }
        } catch (e) {}

        // 2. Also check localStorage 'MultiAccountStore'
        try {
            if (earlyLocalStorage) {
                const rawMa = earlyLocalStorage.getItem('MultiAccountStore');
                if (rawMa) {
                    const parsed = JSON.parse(rawMa);
                    const rawUsers = parsed?._state?.users || parsed?.users || [];
                    const usersArr = Array.isArray(rawUsers) ? rawUsers : Object.values(rawUsers || {});
                    for (const u of usersArr) {
                        if (u && (u.id || u.userId)) {
                            addAcc(u.id || u.userId, u.username, u.globalName || u.global_name || u.username, u.avatar, u.tokenStatus);
                        }
                    }
                }
            }
        } catch (e) {}

        // 3. Also check any user IDs present in localStorage 'tokens' map
        try {
            for (const uid of Object.keys(tokensMap)) {
                if (uid && !found.some(x => x.UserId === uid)) {
                    addAcc(uid, '', '', '', 0);
                }
            }
        } catch (e) {}

        return found;
    }

    let lastActiveDiscordUserId = '';

    async function detectAndSaveCurrentLoggedInAccount(questCountOverride) {
        try {
            if (!Array.isArray(cfg.SavedAccounts)) cfg.SavedAccounts = [];
            let currentUser = getCurrentDiscordUserObject();
            const token = readActiveDiscordTokenFromStorage();
            const tokensMap = readDiscordMultiAccountTokensMap();

            if (!currentUser && token && !isFetchingCurrentUserApi) {
                isFetchingCurrentUserApi = true;
                try {
                    const mods = resolveDiscordModules();
                    if (mods.api) {
                        const res = await mods.api.get({ url: '/users/@me' });
                        if (res?.body?.id) currentUser = res.body;
                    }
                } catch (e) {}
                isFetchingCurrentUserApi = false;
            }

            let changed = false;
            const multiAccounts = harvestDiscordMultiAccountStoreUsers();
            const validLoggedInIds = new Set();

            if (currentUser && currentUser.id) {
                validLoggedInIds.add(String(currentUser.id));
            }
            for (const ma of multiAccounts) {
                validLoggedInIds.add(String(ma.UserId));
                let ex = cfg.SavedAccounts.find(a => a && String(a.UserId) === ma.UserId);
                if (!ex) {
                    cfg.SavedAccounts.push({
                        UserId: ma.UserId,
                        Username: ma.Username,
                        GlobalName: ma.GlobalName,
                        AvatarUrl: ma.AvatarUrl,
                        Token: ma.Token || tokensMap[ma.UserId] || '',
                        AvailableQuestsCount: 0,
                        LastUpdatedUtc: new Date().toISOString()
                    });
                    changed = true;
                } else {
                    if (ma.Username && ex.Username !== ma.Username) { ex.Username = ma.Username; changed = true; }
                    if (ma.GlobalName && ex.GlobalName !== ma.GlobalName) { ex.GlobalName = ma.GlobalName; changed = true; }
                    if (ma.AvatarUrl && ex.AvatarUrl !== ma.AvatarUrl) { ex.AvatarUrl = ma.AvatarUrl; changed = true; }
                    const bestTok = ma.Token || tokensMap[ma.UserId] || ex.Token || '';
                    if (bestTok && ex.Token !== bestTok) { ex.Token = bestTok; changed = true; }
                }
            }

            if (currentUser && currentUser.id) {
                const uid = String(currentUser.id);
                const avatarUrl = currentUser.avatar
                    ? `https://cdn.discordapp.com/avatars/${uid}/${currentUser.avatar}.png?size=128`
                    : normalizeDiscordAvatarUrlToPng('', uid);
                const globalName = currentUser.globalName || currentUser.global_name || currentUser.username || 'Account';
                let existing = cfg.SavedAccounts.find(a => a && String(a.UserId) === uid);
                const qCount = typeof questCountOverride === 'number'
                    ? questCountOverride
                    : (existing && typeof existing.AvailableQuestsCount === 'number' ? existing.AvailableQuestsCount : activeStartedQuestCount);

                if (!existing) {
                    existing = {
                        UserId: uid,
                        Username: String(currentUser.username || ''),
                        GlobalName: String(globalName),
                        AvatarUrl: avatarUrl,
                        Token: token || tokensMap[uid] || '',
                        AvailableQuestsCount: Math.max(0, qCount || 0),
                        LastUpdatedUtc: new Date().toISOString()
                    };
                    cfg.SavedAccounts.unshift(existing);
                    changed = true;
                } else {
                    if (currentUser.username && existing.Username !== String(currentUser.username)) { existing.Username = String(currentUser.username); changed = true; }
                    if (globalName && existing.GlobalName !== String(globalName)) { existing.GlobalName = String(globalName); changed = true; }
                    if (avatarUrl && existing.AvatarUrl !== avatarUrl) { existing.AvatarUrl = avatarUrl; changed = true; }
                    const activeTok = token || tokensMap[uid] || existing.Token || '';
                    if (activeTok && activeTok.length > 15 && existing.Token !== activeTok) { existing.Token = activeTok; changed = true; }
                    if (typeof questCountOverride === 'number' && existing.AvailableQuestsCount !== Math.max(0, questCountOverride)) {
                        existing.AvailableQuestsCount = Math.max(0, questCountOverride);
                        changed = true;
                    }
                }
                if (token && token.length > 15) {
                    previousActiveAccountToken = token;
                    previousActiveAccountName = existing.GlobalName || existing.Username || 'Account';
                }

                // Prune any stale accounts only when MultiAccountStore returned the authoritative multi-account list
                if (multiAccounts.length > 0 && validLoggedInIds.size > 0) {
                    const beforeLen = cfg.SavedAccounts.length;
                    cfg.SavedAccounts = cfg.SavedAccounts.filter(a => a && validLoggedInIds.has(String(a.UserId)));
                    if (cfg.SavedAccounts.length !== beforeLen) {
                        changed = true;
                    }
                }

                // Detect account change and keep Quest Completer workspace locked if active!
                if (lastActiveDiscordUserId && lastActiveDiscordUserId !== uid) {
                    lastActiveDiscordUserId = uid;
                    const wState = readWindowNameState();
                    if (wState.questOnly || cfg.QuestOnlyModeActive) {
                        cfg.QuestOnlyModeActive = true;
                        cfg.QuestHelperEnabled = true;
                        applyQuestOnlyWorkspaceLayout();
                        setTimeout(() => refreshQuestListDisplay(true), 500);
                    }
                } else if (!lastActiveDiscordUserId) {
                    lastActiveDiscordUserId = uid;
                }

                try {
                    if (earlySessionStorage && earlySessionStorage.getItem('__lc_adding_account') === '1') {
                        earlySessionStorage.removeItem('__lc_adding_account');
                        applyQuestOnlyWorkspaceLayout();
                    }
                } catch (e) {}
            }

            if (changed) {
                sendHost('SAVE_ACCOUNTS_JSON:' + JSON.stringify(cfg.SavedAccounts));
            }
            renderLeftAccountsPanelList(currentUser ? String(currentUser.id) : '');
        } catch (e) {}
    }

    window.__lcSyncCurrentAccountQuestCount = (qCount) => {
        detectAndSaveCurrentLoggedInAccount(qCount);
    };

    function markStartupPromptAlreadyShown() {
        hasShownStartupPromptThisSession = true;
        cfg.SessionLaunchPromptShown = true;
        writeWindowNameState({ promptShown: true });
        try { if (earlySessionStorage) earlySessionStorage.setItem('__lc_startup_prompt_shown', '1'); } catch (e) {}
        sendHost('MARK_LAUNCH_PROMPT_SHOWN');
    }

    function switchToSavedDiscordAccount(acc) {
        if (!acc) return;
        try {
            markStartupPromptAlreadyShown();
            const stayInQuestOnly = !!(cfg.QuestOnlyModeActive || readWindowNameState().questOnly);
            writeWindowNameState({ promptShown: true, questOnly: stayInQuestOnly });
            try {
                if (earlySessionStorage) {
                    earlySessionStorage.setItem('__lc_quest_only_active', stayInQuestOnly ? '1' : '0');
                    earlySessionStorage.setItem('__lc_startup_prompt_shown', '1');
                }
            } catch (e) {}
            if (stayInQuestOnly) {
                cfg.QuestOnlyModeActive = true;
                cfg.QuestHelperEnabled = true;
                sendHost('SET_QUEST_ONLY_MODE:1');
            }
            persistPanelSizesNow();

            const curTok = readActiveDiscordTokenFromStorage();
            if (curTok && curTok.length > 15) {
                previousActiveAccountToken = curTok;
                try { if (earlySessionStorage) earlySessionStorage.setItem('__lc_prev_token', curTok); } catch (e) {}
            }

            // 1. Try Discord's native MultiAccountActionCreators.switchAccountToken(userId)
            const allMods = [];
            for (const cObj of webpackCaches) {
                if (cObj && typeof cObj === 'object') {
                    for (const m of Object.values(cObj)) allMods.push(m);
                }
            }
            for (const m of allLoadedModules.values()) allMods.push(m);
            for (const m of allMods) {
                const ex = m?.exports;
                if (!ex || typeof ex !== 'object') continue;
                for (const k of Object.keys(ex)) {
                    let cand = null;
                    try { cand = ex[k]; } catch { continue; }
                    if (cand && typeof cand.switchAccountToken === 'function') {
                        try {
                            cand.switchAccountToken(String(acc.UserId));
                            for (const delayMs of [200, 500, 950, 1600, 2400]) {
                                setTimeout(() => {
                                    if (stayInQuestOnly) {
                                        cfg.QuestOnlyModeActive = true;
                                        cfg.QuestHelperEnabled = true;
                                        writeWindowNameState({ promptShown: true, questOnly: true });
                                        applyQuestOnlyWorkspaceLayout();
                                        if (!(window.location.pathname || '').startsWith('/discovery/quests')) {
                                            navigateDiscordToRoute('/discovery/quests');
                                        }
                                    }
                                    detectAndSaveCurrentLoggedInAccount();
                                    if (stayInQuestOnly && delayMs >= 950) {
                                        refreshQuestListDisplay(true);
                                    }
                                }, delayMs);
                            }
                            return;
                        } catch (e) {}
                    }
                }
            }

            // 2. Fallback: Use token from acc.Token or Discord's localStorage 'tokens' map
            const tokensMap = readDiscordMultiAccountTokensMap();
            const targetToken = (acc.Token && acc.Token.length > 10) ? acc.Token : (tokensMap[String(acc.UserId)] || '');
            if (targetToken && targetToken.length > 10) {
                try {
                    if (earlyLocalStorage) {
                        earlyLocalStorage.setItem('token', JSON.stringify(targetToken));
                        earlyLocalStorage.setItem('user_id_cache', JSON.stringify(acc.UserId));
                    }
                    syncLocalStorageToHostMirror();
                } catch (e) {}
                setTimeout(() => {
                    window.location.href = stayInQuestOnly ? '/discovery/quests' : '/channels/@me';
                }, 80);
            } else {
                try { if (earlySessionStorage) earlySessionStorage.setItem('__lc_adding_account', '1'); } catch (e) {}
                window.location.href = '/login';
            }
        } catch (e) {}
    }

    function openAccountSwitchPrompt(acc) {
        if (!acc || !document.body) return;
        if (!accountSwitchModal || !accountSwitchModal.isConnected) {
            accountSwitchModal = document.createElement('div');
            accountSwitchModal.id = 'lc-account-switch-modal';
            accountSwitchModal.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.68);display:none;align-items:center;justify-content:center;user-select:none;font-family:Segoe UI, sans-serif;';
            document.body.appendChild(accountSwitchModal);
        }
        const qCount = Number(acc.AvailableQuestsCount) || 0;
        const dispName = acc.GlobalName || acc.Username || 'Discord Account';
        const subHandle = acc.Username ? ('@' + acc.Username) : ('ID: ' + acc.UserId);
        const avUrl = acc.AvatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';

        accountSwitchModal.innerHTML = `
            <div style='width:348px;background:#16171a;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:18px;box-shadow:0 24px 60px rgba(0,0,0,0.85);color:#dbdee1;'>
                <div style='display:flex;align-items:center;gap:12px;margin-bottom:13px;'>
                    <img src='${avUrl}' alt='' style='width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid #5865f2;flex-shrink:0;' />
                    <div style='min-width:0;flex:1;'>
                        <div style='font-size:14.5px;font-weight:700;color:#f2f3f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${dispName}</div>
                        <div style='font-size:12px;color:#949ba4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${subHandle}</div>
                    </div>
                    <span style='background:rgba(35,165,90,0.2);border:1px solid rgba(35,165,90,0.5);color:#57e389;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;flex-shrink:0;'>🎯 ${qCount}</span>
                </div>
                <div style='font-size:13px;color:#dbdee1;line-height:1.45;margin-bottom:16px;'>
                    Switch account to <b>${dispName}</b>?
                </div>
                <div style='display:flex;justify-content:flex-end;gap:8px;'>
                    <button id='lc-acc-sw-cancel' style='background:#232428;color:#dbdee1;border:1px solid rgba(255,255,255,0.1);border-radius:7px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;'>Cancel</button>
                    <button id='lc-acc-sw-confirm' style='background:#5865f2;color:#fff;border:none;border-radius:7px;padding:7px 15px;font-size:12px;font-weight:700;cursor:pointer;'>Switch Account</button>
                </div>
            </div>
        `;
        accountSwitchModal.style.display = 'flex';
        document.getElementById('lc-acc-sw-cancel').addEventListener('click', () => { accountSwitchModal.style.display = 'none'; });
        document.getElementById('lc-acc-sw-confirm').addEventListener('click', () => {
            accountSwitchModal.style.display = 'none';
            switchToSavedDiscordAccount(acc);
        });
    }

    function startAddNewDiscordAccountFlow() {
        try {
            markStartupPromptAlreadyShown();
            persistPanelSizesNow();
            detectAndSaveCurrentLoggedInAccount();
            const curTok = readActiveDiscordTokenFromStorage();
            if (curTok && curTok.length > 15) {
                previousActiveAccountToken = curTok;
                try { if (earlySessionStorage) earlySessionStorage.setItem('__lc_prev_token', curTok); } catch (e) {}
            }
            try { if (earlySessionStorage) earlySessionStorage.setItem('__lc_adding_account', '1'); } catch (e) {}
            try { if (earlyLocalStorage) earlyLocalStorage.removeItem('token'); } catch (e) {}
            window.location.href = '/login';
        } catch (e) {}
    }

    function ensureLoginBackButtonOverlay() {
        if (!document.body) return;
        if (!loginBackFab || !loginBackFab.isConnected) {
            loginBackFab = document.createElement('div');
            loginBackFab.id = 'lc-login-back-fab';
            loginBackFab.style.cssText = 'position:fixed;top:44px;left:16px;z-index:2147483647;display:none;align-items:center;gap:8px;background:#16171a;border:1px solid #5865f2;border-radius:9px;padding:8px 14px;box-shadow:0 10px 28px rgba(0,0,0,0.65);color:#fff;cursor:pointer;user-select:none;font-family:Segoe UI, sans-serif;font-size:12.5px;font-weight:700;';
            loginBackFab.innerHTML = `${MSR.arrowBack}<span>Back to Logged-In Account</span>`;
            loginBackFab.addEventListener('click', (e) => {
                e.stopPropagation();
                markStartupPromptAlreadyShown();
                try { if (earlySessionStorage) earlySessionStorage.removeItem('__lc_adding_account'); } catch (err) {}
                let savedTok = previousActiveAccountToken;
                if (!savedTok && earlySessionStorage) {
                    try { savedTok = earlySessionStorage.getItem('__lc_prev_token') || ''; } catch (err) {}
                }
                if (!savedTok && Array.isArray(cfg.SavedAccounts) && cfg.SavedAccounts.length > 0) {
                    const withTok = cfg.SavedAccounts.find(a => a && a.Token && a.Token.length > 15);
                    if (withTok) savedTok = withTok.Token;
                }
                if (savedTok && savedTok.length > 15 && earlyLocalStorage) {
                    try {
                        earlyLocalStorage.setItem('token', JSON.stringify(savedTok));
                        syncLocalStorageToHostMirror();
                    } catch (err) {}
                }
                window.location.href = cfg.QuestOnlyModeActive ? '/discovery/quests' : '/app';
            });
            document.body.appendChild(loginBackFab);
        }
        const p = window.location.pathname || '';
        const isLoginScreen = p.startsWith('/login') || p.startsWith('/register') || !!document.querySelector('form[class*=authBox_]');
        loginBackFab.style.display = isLoginScreen ? 'inline-flex' : 'none';
        if (isLoginScreen && leftAccountsPanel && leftAccountsPanel.style.display !== 'none') {
            applyQuestOnlyWorkspaceLayout();
        } else if (!isLoginScreen && (cfg.QuestOnlyModeActive || readWindowNameState().questOnly)) {
            if (!cfg.QuestOnlyModeActive) {
                cfg.QuestOnlyModeActive = true;
                cfg.QuestHelperEnabled = true;
            }
            if (!document.body.classList.contains('lc-quest-only-mode') || (leftAccountsPanel && leftAccountsPanel.style.display === 'none')) {
                applyQuestOnlyWorkspaceLayout();
            }
            const isAlreadyOnQuestsPage = p.startsWith('/discovery/quests') || p.startsWith('/quest-home') || p.includes('/quests');
            if (!isAlreadyOnQuestsPage) {
                navigateDiscordToRoute('/discovery/quests');
            }
        }
    }

    function isLeftAccountsCollapsedRail() {
        return (Number(cfg.LeftAccountsPanelWidth) || 240) <= 115;
    }

    function getEffectiveLeftAccountsWidth() {
        const rawW = Number(cfg.LeftAccountsPanelWidth) || 240;
        if (rawW <= 115) return 68;
        return Math.max(180, Math.min(430, Math.round(rawW)));
    }

    function createLeftAccountsPanelIfNeeded() {
        if (!document.body) return;
        if (!leftAccountsPanel || !leftAccountsPanel.isConnected) {
            leftAccountsPanel = document.createElement('div');
            leftAccountsPanel.id = 'lc-left-accounts-panel';
            const initW = getEffectiveLeftAccountsWidth();
            leftAccountsPanel.style.cssText = `position:fixed;top:38px;left:0;bottom:0;width:${initW}px;z-index:2147483644;background:#16171a;border-right:1px solid rgba(255,255,255,0.08);display:none;flex-direction:column;user-select:none;font-family:Segoe UI, sans-serif;color:#dbdee1;`;
            leftAccountsPanel.innerHTML = `
                <div id='lc-left-acc-hdr' style='padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;'>
                    <div style='display:flex;align-items:center;gap:8px;'>
                        <span style='color:#949ba4;display:flex;'>${MSR.group}</span>
                        <strong id='lc-left-acc-hdr-title' style='font-size:13.5px;color:#f2f3f5;'>Accounts</strong>
                    </div>
                    <span id='lc-left-acc-count-pill' style='font-size:11px;font-weight:700;padding:1.5px 7px;border-radius:999px;background:#232428;color:#949ba4;'>0</span>
                </div>
                <div id='lc-left-acc-sub' style='padding:8px 14px 2px 14px;font-size:10.5px;font-weight:700;color:#80848e;text-transform:uppercase;letter-spacing:0.5px;'>
                    Click account to switch
                </div>
                <div id='lc-left-accounts-list' style='flex:1;overflow-y:auto;padding:8px 10px;'></div>
                <div id='lc-left-acc-footer' style='padding:10px 12px;border-top:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:7px;background:#111214;'>
                    <button id='lc-left-add-account-btn' title='Add Discord Account' style='width:100%;height:34px;background:#232428;color:#f2f3f5;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;'>
                        ${MSR.personAdd}<span id='lc-left-add-lbl'>Add Account</span>
                    </button>
                    <button id='lc-left-switch-discord-btn' title='Switch to Full Discord Client (Ctrl+Shift+D)' style='width:100%;height:36px;background:#5865f2;color:#ffffff;border:none;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;'>
                        ${MSR.swap}<span id='lc-left-sw-lbl'>Switch to Discord</span>
                    </button>
                </div>
            `;
            document.body.appendChild(leftAccountsPanel);

            document.getElementById('lc-left-add-account-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                startAddNewDiscordAccountFlow();
            });
            document.getElementById('lc-left-switch-discord-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.__lcSetQuestOnlyMode) window.__lcSetQuestOnlyMode(false, true);
            });
        }

        if (!leftPanelResizer || !leftPanelResizer.isConnected) {
            leftPanelResizer = document.createElement('div');
            leftPanelResizer.id = 'lc-left-acc-resizer';
            leftPanelResizer.style.cssText = 'position:fixed;top:38px;bottom:0;width:6px;z-index:2147483645;cursor:ew-resize;display:none;background:transparent;';
            document.body.appendChild(leftPanelResizer);

            leftPanelResizer.addEventListener('mousedown', (e) => {
                if (!cfg.QuestOnlyModeActive) return;
                e.preventDefault();
                e.stopPropagation();
                const onMove = (me) => {
                    const rawX = Math.round(me.clientX);
                    const newW = rawX < 135 ? 68 : Math.max(180, Math.min(430, rawX));
                    cfg.LeftAccountsPanelWidth = newW;
                    applyQuestOnlyWorkspaceLayout();
                };
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove, true);
                    window.removeEventListener('mouseup', onUp, true);
                    persistPanelSizesNow();
                };
                window.addEventListener('mousemove', onMove, true);
                window.addEventListener('mouseup', onUp, true);
            });
        }

        if (!rightPanelResizer || !rightPanelResizer.isConnected) {
            rightPanelResizer = document.createElement('div');
            rightPanelResizer.id = 'lc-right-quest-resizer';
            rightPanelResizer.style.cssText = 'position:fixed;top:38px;bottom:0;width:6px;z-index:2147483647;cursor:ew-resize;display:none;background:transparent;';
            document.body.appendChild(rightPanelResizer);

            rightPanelResizer.addEventListener('mousedown', (e) => {
                if (!cfg.QuestOnlyModeActive) return;
                e.preventDefault();
                e.stopPropagation();
                const onMove = (me) => {
                    const newRightW = Math.round(Math.max(290, Math.min(540, window.innerWidth - me.clientX)));
                    cfg.RightQuestPanelWidth = newRightW;
                    applyQuestOnlyWorkspaceLayout();
                };
                const onUp = () => {
                    window.removeEventListener('mousemove', onMove, true);
                    window.removeEventListener('mouseup', onUp, true);
                    persistPanelSizesNow();
                };
                window.addEventListener('mousemove', onMove, true);
                window.addEventListener('mouseup', onUp, true);
            });
        }
    }

    function renderLeftAccountsPanelList(curUserIdOverride = '') {
        const listNode = document.getElementById('lc-left-accounts-list');
        if (!listNode) return;
        const accounts = Array.isArray(cfg.SavedAccounts) ? cfg.SavedAccounts : [];
        const collapsedRail = isLeftAccountsCollapsedRail();

        const hdrEl = document.getElementById('lc-left-acc-hdr');
        const hdrTitle = document.getElementById('lc-left-acc-hdr-title');
        const countPill = document.getElementById('lc-left-acc-count-pill');
        const subEl = document.getElementById('lc-left-acc-sub');
        const footerEl = document.getElementById('lc-left-acc-footer');
        const addLbl = document.getElementById('lc-left-add-lbl');
        const swLbl = document.getElementById('lc-left-sw-lbl');

        if (countPill) {
            countPill.textContent = String(accounts.length);
            countPill.style.display = collapsedRail ? 'none' : 'inline-block';
        }
        if (hdrTitle) hdrTitle.style.display = collapsedRail ? 'none' : 'inline';
        if (hdrEl) {
            hdrEl.style.justifyContent = collapsedRail ? 'center' : 'space-between';
            hdrEl.style.padding = collapsedRail ? '10px 6px' : '12px 14px';
        }
        if (subEl) subEl.style.display = collapsedRail ? 'none' : 'block';
        if (listNode) listNode.style.padding = collapsedRail ? '8px 6px' : '8px 10px';
        if (footerEl) footerEl.style.padding = collapsedRail ? '8px 8px' : '10px 12px';
        if (addLbl) addLbl.style.display = collapsedRail ? 'none' : 'inline';
        if (swLbl) swLbl.style.display = collapsedRail ? 'none' : 'inline';

        let curUserId = curUserIdOverride;
        if (!curUserId) {
            const curU = getCurrentDiscordUserObject();
            if (curU && curU.id) curUserId = String(curU.id);
        }

        if (accounts.length === 0) {
            listNode.innerHTML = collapsedRail
                ? `<div style='padding:10px 0;font-size:11px;color:#949ba4;text-align:center;'>...</div>`
                : `<div style='padding:12px 8px;font-size:12px;color:#949ba4;text-align:center;'>Loading logged-in Discord account...</div>`;
            return;
        }

        let html = '';
        for (let i = 0; i < accounts.length; i++) {
            const acc = accounts[i];
            if (!acc) continue;
            const isCurrent = (curUserId && String(acc.UserId) === String(curUserId)) || (accounts.length === 1 && i === 0);
            const qCount = isCurrent ? Math.max(Number(acc.AvailableQuestsCount) || 0, activeStartedQuestCount || 0) : (Number(acc.AvailableQuestsCount) || 0);
            const dispName = acc.GlobalName || acc.Username || 'Account';
            const handle = acc.Username ? ('@' + acc.Username) : '';
            const avUrl = acc.AvatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';

            if (collapsedRail) {
                const avatarStroke = isCurrent ? '2.5px solid #5865f2' : '1.5px solid rgba(255,255,255,0.14)';
                const avatarGlow = isCurrent ? '0 0 0 2px rgba(88, 101, 242, 0.32)' : 'none';
                const badgeBg = qCount > 0 ? '#23a55a' : '#232428';
                const badgeCol = qCount > 0 ? '#ffffff' : '#949ba4';

                html += `
                    <div class='lc-left-acc-card' data-acc-idx='${i}' title='${dispName} (${handle}) • ${qCount} Quests' style='margin:0 auto 10px auto;width:46px;height:46px;position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;'>
                        <img src='${avUrl}' alt='' style='width:42px;height:42px;border-radius:50%;object-fit:cover;display:block;border:${avatarStroke};box-shadow:${avatarGlow};' />
                        <span style='position:absolute;right:-2px;bottom:-2px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:${badgeBg};color:${badgeCol};border:2px solid #16171a;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;line-height:1;'>${qCount}</span>
                    </div>
                `;
            } else {
                const borderCol = isCurrent ? '#5865f2' : 'rgba(255,255,255,0.06)';
                const bgCol = isCurrent ? 'rgba(88, 101, 242, 0.14)' : 'rgba(255,255,255,0.03)';
                const qBadgeBg = qCount > 0 ? 'rgba(35, 165, 90, 0.22)' : 'rgba(255, 255, 255, 0.07)';
                const qBadgeColor = qCount > 0 ? '#57e389' : '#949ba4';

                html += `
                    <div class='lc-left-acc-card' data-acc-idx='${i}' style='padding:9px 11px;margin-bottom:6px;border-radius:9px;background:${bgCol};border:1px solid ${borderCol};display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;'>
                        <div style='display:flex;align-items:center;gap:10px;min-width:0;flex:1;'>
                            <div style='position:relative;width:36px;height:36px;flex-shrink:0;'>
                                <img src='${avUrl}' alt='' style='width:36px;height:36px;border-radius:50%;object-fit:cover;display:block;border:${isCurrent ? '2px solid #5865f2' : 'none'};' />
                                <span style='position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:${isCurrent ? '#23a55a' : '#80848e'};border:2px solid #16171a;'></span>
                            </div>
                            <div style='min-width:0;flex:1;'>
                                <div style='font-size:13px;font-weight:600;color:#f2f3f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${dispName}</div>
                                <div style='font-size:11px;color:#949ba4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${isCurrent ? 'Active • ' + handle : handle}</div>
                            </div>
                        </div>
                        <span style='padding:2.5px 8px;border-radius:999px;background:${qBadgeBg};color:${qBadgeColor};font-size:11px;font-weight:800;flex-shrink:0;'>🎯 ${qCount}</span>
                    </div>
                `;
            }
        }
        listNode.innerHTML = html;

        for (const card of listNode.querySelectorAll('.lc-left-acc-card')) {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(card.getAttribute('data-acc-idx') || '0', 10);
                const picked = accounts[idx];
                if (picked) openAccountSwitchPrompt(picked);
            });
        }
    }

    function applyQuestOnlyWorkspaceLayout() {
        createLeftAccountsPanelIfNeeded();
        if (!questHud || !questHud.isConnected) createQuestCompleterHud();
        const p = window.location.pathname || '';
        const isLoginScreen = p.startsWith('/login') || p.startsWith('/register') || !!document.querySelector('form[class*=authBox_]');
        const isQuestOnly = !!cfg.QuestOnlyModeActive && !isLoginScreen;
        const leftW = getEffectiveLeftAccountsWidth();
        const rightW = Math.round(Math.max(290, Math.min(540, Number(cfg.RightQuestPanelWidth) || 352)));

        let wsStyle = document.getElementById('lc-quest-only-workspace-style');
        if (!wsStyle && document.head) {
            wsStyle = document.createElement('style');
            wsStyle.id = 'lc-quest-only-workspace-style';
            document.head.appendChild(wsStyle);
        }

        const minBtn = document.getElementById('lc-q-min');
        const closeBtn = document.getElementById('lc-q-close');
        const vExpBtn = document.getElementById('lc-q-vexpand-btn');
        const vTop = document.getElementById('lc-quest-vresize-top');
        const vBot = document.getElementById('lc-quest-vresize-bottom');
        const expCard = document.getElementById('lc-quest-expanded-card');
        const qList = document.getElementById('lc-quest-list');
        const qDragHdr = document.getElementById('lc-quest-drag-header');

        if (isQuestOnly) {
            if (document.body) document.body.classList.add('lc-quest-only-mode');
            if (leftAccountsPanel) {
                leftAccountsPanel.style.width = leftW + 'px';
                leftAccountsPanel.style.display = 'flex';
            }
            if (leftPanelResizer) {
                leftPanelResizer.style.left = (leftW - 3) + 'px';
                leftPanelResizer.style.display = 'block';
            }
            if (rightPanelResizer) {
                rightPanelResizer.style.right = (rightW - 3) + 'px';
                rightPanelResizer.style.display = 'block';
            }
            if (questHud) {
                isQuestCollapsed = false;
                const fabEl = document.getElementById('lc-quest-fab-pill');
                if (fabEl) fabEl.style.display = 'none';
                questHud.style.display = 'block';
                questHud.style.top = '38px';
                questHud.style.bottom = '0px';
                questHud.style.right = '0px';
                questHud.style.left = 'auto';
                questHud.style.width = rightW + 'px';
                questHud.style.height = 'calc(100vh - 38px)';
            }
            if (expCard) {
                expCard.style.width = '100%';
                expCard.style.height = 'calc(100vh - 38px)';
                expCard.style.borderRadius = '0px';
                expCard.style.display = 'flex';
                expCard.style.flexDirection = 'column';
            }
            if (qList) {
                qList.style.maxHeight = 'none';
                qList.style.flex = '1';
            }
            if (qDragHdr) qDragHdr.style.cursor = 'default';
            if (minBtn) minBtn.style.display = 'none';
            if (closeBtn) closeBtn.style.display = 'none';
            if (vExpBtn) vExpBtn.style.display = 'none';
            if (vTop) vTop.style.display = 'none';
            if (vBot) vBot.style.display = 'none';

            if (wsStyle) {
                wsStyle.textContent = `
                    body.lc-quest-only-mode #app-mount {
                        position: fixed !important; top: 38px !important; bottom: 0 !important;
                        left: ${leftW}px !important; right: ${rightW}px !important;
                        width: calc(100vw - ${leftW + rightW}px) !important; height: calc(100vh - 38px) !important; overflow: hidden !important;
                    }
                    body.lc-quest-only-mode nav[class*='guilds_'],
                    body.lc-quest-only-mode [class*='sidebar_'] {
                        display: none !important;
                    }
                `;
            }
            const isAlreadyOnQuestsPage = p.startsWith('/discovery/quests') || p.startsWith('/quest-home') || p.includes('/quests');
            if (!isAlreadyOnQuestsPage && !isLoginScreen) {
                navigateDiscordToRoute('/discovery/quests');
            }
            detectAndSaveCurrentLoggedInAccount();
            renderLeftAccountsPanelList();
        } else {
            if (document.body) document.body.classList.remove('lc-quest-only-mode');
            if (leftAccountsPanel) leftAccountsPanel.style.display = 'none';
            if (leftPanelResizer) leftPanelResizer.style.display = 'none';
            if (rightPanelResizer) rightPanelResizer.style.display = 'none';
            if (wsStyle) wsStyle.textContent = '';
            if (qDragHdr) qDragHdr.style.cursor = 'grab';
            if (minBtn) minBtn.style.display = 'inline-flex';
            if (closeBtn) closeBtn.style.display = 'inline-flex';
            if (vExpBtn) vExpBtn.style.display = 'inline-flex';
            if (vTop) vTop.style.display = 'flex';
            if (vBot) vBot.style.display = 'flex';
            if (expCard) {
                expCard.style.width = '356px';
                expCard.style.height = 'auto';
                expCard.style.borderRadius = '12px';
            }
            if (qList) {
                const savedListH = Math.max(110, Math.min(620, Number(cfg.QuestHudListHeight) || 170));
                qList.style.maxHeight = savedListH + 'px';
            }
            if (questHud) {
                questHud.style.width = 'auto';
                questHud.style.height = 'auto';
                setQuestCollapsedState(isQuestCollapsed);
                questHud.style.display = (cfg.QuestCompleterInstalled !== false && cfg.QuestHelperEnabled && !isLoginScreen) ? 'block' : 'none';
            }
        }
        syncMenuSwitches();
    }

    window.__lcSetQuestOnlyMode = (enableQuestOnly, navigateIfReverting = false) => {
        markStartupPromptAlreadyShown();
        cfg.QuestOnlyModeActive = !!enableQuestOnly;
        writeWindowNameState({ promptShown: true, questOnly: cfg.QuestOnlyModeActive });
        try {
            if (earlySessionStorage) {
                earlySessionStorage.setItem('__lc_quest_only_active', cfg.QuestOnlyModeActive ? '1' : '0');
            }
        } catch (e) {}
        if (cfg.QuestOnlyModeActive) cfg.QuestHelperEnabled = true;
        persistPanelSizesNow();
        sendHost('SET_QUEST_ONLY_MODE:' + (cfg.QuestOnlyModeActive ? '1' : '0'));
        applyQuestOnlyWorkspaceLayout();
        if (cfg.QuestOnlyModeActive) {
            detectAndSaveCurrentLoggedInAccount();
            refreshQuestListDisplay(true);
        } else if (navigateIfReverting || (window.location.pathname || '').includes('/quests') || (window.location.pathname || '').includes('/discovery')) {
            try {
                navigateDiscordToRoute('/channels/@me');
                setTimeout(() => {
                    const homeBtn = document.querySelector('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"]');
                    if (homeBtn && ((window.location.pathname || '').includes('/quests') || (window.location.pathname || '').includes('/discovery'))) {
                        homeBtn.click();
                    }
                }, 80);
            } catch (e) {}
        }
    };

    function maybeShowStartupLaunchPromptModal() {
        if (!document.body) return;
        const wState = readWindowNameState();
        const alreadyShownInSession = hasShownStartupPromptThisSession
            || !!cfg.SessionLaunchPromptShown
            || !!wState.promptShown
            || typeof wState.questOnly === 'boolean'
            || (earlySessionStorage && earlySessionStorage.getItem('__lc_startup_prompt_shown') === '1')
            || (earlySessionStorage && earlySessionStorage.getItem('__lc_adding_account') === '1');

        if (cfg.QuestCompleterInstalled === false) return;
        const p = window.location.pathname || '';
        if (alreadyShownInSession || p.startsWith('/login') || p.startsWith('/register')) return;
        markStartupPromptAlreadyShown();

        const mode = cfg.StartupLaunchMode || 'Ask';
        if (mode === 'QuestOnly') {
            window.__lcSetQuestOnlyMode(true, false);
            return;
        }
        if (mode === 'Discord') {
            if (cfg.QuestOnlyModeActive) window.__lcSetQuestOnlyMode(false, false);
            return;
        }

        startupPromptModal = document.createElement('div');
        startupPromptModal.id = 'lc-startup-launch-modal';
        startupPromptModal.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.68);display:flex;align-items:center;justify-content:center;user-select:none;font-family:Segoe UI, sans-serif;';
        const appName = getEffectiveAppName();
        startupPromptModal.innerHTML = `
            <div style='width:328px;background:#16171a;border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:18px;box-shadow:0 24px 60px rgba(0,0,0,0.85);color:#dbdee1;'>
                <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;'>
                    <strong style='font-size:14.5px;font-weight:700;color:#f2f3f5;'>${appName}</strong>
                    <span style='font-size:11px;font-weight:600;padding:2px 7px;border-radius:5px;background:#232428;color:#949ba4;'>v0.6.6</span>
                </div>
                <div style='display:flex;flex-direction:column;gap:8px;margin-bottom:14px;'>
                    <button id='lc-start-btn-discord' style='width:100%;text-align:left;padding:11px 13px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#f2f3f5;cursor:pointer;display:flex;align-items:center;justify-content:space-between;'>
                        <div style='display:flex;align-items:center;gap:12px;'>
                            <span style='width:34px;height:34px;border-radius:8px;background:rgba(88,101,242,0.16);color:#5865f2;display:flex;align-items:center;justify-content:center;'>${MSR.desktop}</span>
                            <div>
                                <div style='font-size:13.5px;font-weight:600;'>Discord</div>
                                <div style='font-size:11.5px;color:#949ba4;'>Default client with floating Quests</div>
                            </div>
                        </div>
                        <span style='font-size:15px;color:#949ba4;'>›</span>
                    </button>
                    <button id='lc-start-btn-questonly' style='width:100%;text-align:left;padding:11px 13px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#f2f3f5;cursor:pointer;display:flex;align-items:center;justify-content:space-between;'>
                        <div style='display:flex;align-items:center;gap:12px;'>
                            <span style='width:34px;height:34px;border-radius:8px;background:rgba(35,165,90,0.16);color:#23a55a;display:flex;align-items:center;justify-content:center;'>${MSR.target}</span>
                            <div>
                                <div style='font-size:13.5px;font-weight:600;'>Quest Completer Only</div>
                                <div style='font-size:11.5px;color:#949ba4;'>Dedicated Quests &amp; Accounts workspace</div>
                            </div>
                        </div>
                        <span style='font-size:15px;color:#949ba4;'>›</span>
                    </button>
                </div>
                <label style='display:flex;align-items:center;gap:8px;font-size:12px;color:#949ba4;cursor:pointer;'>
                    <input id='lc-start-remember-chk' type='checkbox' style='accent-color:#5865f2;cursor:pointer;margin:0;' />
                    <span>Remember choice</span>
                </label>
            </div>
        `;
        document.body.appendChild(startupPromptModal);

        const finishChoice = (chosenMode) => {
            markStartupPromptAlreadyShown();
            const remChk = document.getElementById('lc-start-remember-chk');
            if (remChk && remChk.checked) {
                cfg.StartupLaunchMode = chosenMode;
                sendHost('SET_LAUNCH_MODE:' + chosenMode);
            }
            if (startupPromptModal) {
                startupPromptModal.remove();
                startupPromptModal = null;
            }
            if (chosenMode === 'QuestOnly') window.__lcSetQuestOnlyMode(true, false);
            else window.__lcSetQuestOnlyMode(false, false);
        };
        document.getElementById('lc-start-btn-discord').addEventListener('click', () => finishChoice('Discord'));
        document.getElementById('lc-start-btn-questonly').addEventListener('click', () => finishChoice('QuestOnly'));
    }

    window.__lcRunUnifiedUpdater = async () => {
        const updBtn = document.getElementById('lc-btn-update-all-now');
        if (updBtn) { updBtn.textContent = 'Updating...'; updBtn.disabled = true; }
        sendHost('RUN_UPDATE_ALL_NOW');
        try { await refreshQuestListDisplay(true); } catch (e) {}
    };

    window.__lcOnUpdateAllCompleted = (ok, newVer, hotReloadedJs) => {
        const effVer = (typeof newVer === 'string' && newVer.trim()) ? newVer.trim() : '0.6.6';
        const updBtn = document.getElementById('lc-btn-update-all-now');
        if (updBtn) {
            updBtn.textContent = 'Up to Date';
            updBtn.disabled = false;
            setTimeout(() => { if (updBtn) updBtn.textContent = 'Check OTA'; }, 2400);
        }
        const verPill = document.getElementById('lc-hdr-ver-pill');
        if (verPill) verPill.textContent = 'v' + effVer;
        const metaTitle = document.getElementById('lc-meta-version-title');
        if (metaTitle) metaTitle.textContent = `App v${effVer} • Installer v6.6.0`;
        const statusLbl = document.getElementById('lc-upd-status-lbl');
        if (statusLbl) {
            statusLbl.textContent = hotReloadedJs
                ? `Engine ${effVer}-rust • OTA update applied!`
                : `Engine ${effVer}-rust • All components up to date`;
            statusLbl.style.color = '#57e389';
        }
        setQuestLog(`DisCRust v${effVer} OTA & Quests synced!`, '#23a55a');
    };

    // Periodically compact offscreen Discord #chat media & decoded frames to keep renderer RAM low
    function compactOffscreenDiscordMedia() {
        try {
            if (cfg && cfg.AutoTrimRamEnabled === false) return;
            const vh = window.innerHeight || 800;
            // Pause offscreen chat preview videos that scrolled far out of view (never touch active stream/call videos!)
            const chatVideos = document.querySelectorAll('[class*="chatContent_"] video, [class*="scrollerInner_"] video');
            for (const v of chatVideos) {
                if (!v || v.srcObject || v.paused) continue;
                const r = v.getBoundingClientRect();
                if (r.bottom < -700 || r.top > vh + 700) {
                    try { v.pause(); } catch (e) {}
                }
            }
            // Prune webpack module map once all core stores are harvested
            if (harvestedAllStoresOnce && allLoadedModules.size > 250) {
                allLoadedModules.clear();
            }
        } catch (e) {}
    }
    setInterval(compactOffscreenDiscordMedia, 9000);

    // Automatic background OTA check 6s after startup when Automatic Component Updates is enabled
    setTimeout(() => {
        if (cfg && cfg.AutoUpdateAllEnabled !== false) {
            sendHost('RUN_UPDATE_ALL_NOW');
        }
    }, 6500);

    document.addEventListener('click', () => {
        setTimeout(syncAdaptiveTitleBarTheme, 30);
        setTimeout(syncAdaptiveTitleBarTheme, 180);
    }, true);

    // Auto-recover if Discord's React ErrorBoundary ever triggers on initial cold launch,
    // and keep background telemetry lightweight so chat switching is instant!
    let lcAutoRecoveredCrashOnce = false;
    setInterval(() => {
        try {
            if (!lcAutoRecoveredCrashOnce && document.body) {
                const bodyTxt = document.body.innerText || '';
                if (bodyTxt.includes('Well, this is awkward') || bodyTxt.includes('crashed unexpectedly')) {
                    lcAutoRecoveredCrashOnce = true;
                    window.location.reload();
                    return;
                }
            }
        } catch (e) {}
        ensureLoginBackButtonOverlay();
        syncAdaptiveTitleBarTheme();
        ensureFluxNotificationSubscription();
        hydrateDiscordDetectableGamesDatabase();
        pollAndSyncTaskbarAndTrayState();
    }, 1500);

    setInterval(() => {
        detectAndSaveCurrentLoggedInAccount();
    }, 10000);

    function ensureUiMounted() {
        if (!document.head || !document.body) return;
        loadSavedPanelSizesIntoCfg();
        injectMaterialSymbolsFont();
        createDiscordAdaptiveTitleBar();
        createTopDropdownMenu();
        createQuestCompleterHud();
        createLeftAccountsPanelIfNeeded();
        ensureLoginBackButtonOverlay();
        applyQuestOnlyWorkspaceLayout();
        maybeShowStartupLaunchPromptModal();
        if (!window.__lcRequestedInitialCfgSync) {
            window.__lcRequestedInitialCfgSync = true;
            sendHost('REQUEST_CONFIG_SYNC');
        }
        setTimeout(() => detectAndSaveCurrentLoggedInAccount(), 900);
        setTimeout(() => detectAndSaveCurrentLoggedInAccount(), 2400);
    }

    window.__litecordApplyConfig = (newCfg) => {
        const prevQOnly = !!cfg.QuestOnlyModeActive;
        cfg = Object.assign(cfg, newCfg);
        try {
            const wState = readWindowNameState();
            if (typeof wState.questOnly === 'boolean') {
                cfg.QuestOnlyModeActive = wState.questOnly;
                if (wState.questOnly) cfg.QuestHelperEnabled = true;
            }
            if (wState.promptShown) {
                cfg.SessionLaunchPromptShown = true;
            }
        } catch (e) {}
        ensureUiMounted();
        if (prevQOnly !== !!cfg.QuestOnlyModeActive) {
            applyQuestOnlyWorkspaceLayout();
        }
        syncMenuSwitches();
    };

    window.addEventListener('DOMContentLoaded', () => {
        ensureUiMounted();
        if (cfg.QuestHelperEnabled && cfg.QuestAutoScan !== false) {
            setTimeout(() => refreshQuestListDisplay(true), 2400);
        }
    });
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        ensureUiMounted();
    }

    // ------------------------------------------------------------------------
    // 5. CLIENT WINDOW ROUNDED CORNERS (WHEN NOT FULL-SCREEN / MAXIMIZED)
    //    & KEYBOARD SHORTCUTS REMAPPING ENGINE (DisCRust v0.6.6)
    // ------------------------------------------------------------------------
    const DEFAULT_SHORTCUTS = {
        questOnly:      'Alt+Q', // Quest Completer Interface (Quests-Only Mode)
        questFloating:  'Alt+F', // Quest Completer Floating Window
        configMenu:     'Alt+C', // Summoning Configurations
        shortcutsMenu:  'Alt+K', // The Keyboard Shortcuts Menu
        restartApp:     'Alt+R', // Restarting App
        quitApp:        'Alt+X'  // Quitting App
    };

    const DISCORD_RESERVED_SHORTCUTS = new Set([
        'Ctrl+K', 'Ctrl+F', 'Ctrl+E', 'Ctrl+P', 'Ctrl+R', 'Ctrl+,',
        'Ctrl+Shift+M', 'Ctrl+Shift+D', 'Ctrl+Shift+I', 'Ctrl+Shift+U',
        'Alt+ArrowUp', 'Alt+ArrowDown', 'Alt+ArrowLeft', 'Alt+ArrowRight'
    ]);

    let activeShortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
    let recordingShortcutKey = null;
    let shortcutsModalEl = null;

    function loadSavedShortcuts() {
        try {
            if (cfg && typeof cfg.ShortcutsJson === 'string' && cfg.ShortcutsJson.trim().startsWith('{')) {
                const parsed = JSON.parse(cfg.ShortcutsJson);
                if (parsed && typeof parsed === 'object') {
                    activeShortcuts = Object.assign({}, DEFAULT_SHORTCUTS, parsed);
                }
            } else if (earlyLocalStorage) {
                const raw = earlyLocalStorage.getItem('__discrust_shortcuts_v066');
                if (raw && raw.startsWith('{')) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        activeShortcuts = Object.assign({}, DEFAULT_SHORTCUTS, parsed);
                    }
                }
            }
        } catch (e) {}
    }

    function saveShortcutsConfig() {
        try {
            const json = JSON.stringify(activeShortcuts);
            cfg.ShortcutsJson = json;
            if (earlyLocalStorage) {
                earlyLocalStorage.setItem('__discrust_shortcuts_v066', json);
            }
            sendHost('SAVE_SHORTCUTS_JSON:' + json);
            updateTitleBarElements();
        } catch (e) {}
    }

    function getShortcutLabel(actionKey) {
        return (activeShortcuts && activeShortcuts[actionKey]) ? activeShortcuts[actionKey] : (DEFAULT_SHORTCUTS[actionKey] || '');
    }

    function formatKeyEventCombo(e) {
        if (!e || !e.key) return '';
        const k = e.key;
        if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') return '';
        const parts = [];
        if (e.ctrlKey) parts.push('Ctrl');
        if (e.altKey) parts.push('Alt');
        if (e.shiftKey) parts.push('Shift');
        let mainKey = k.length === 1 ? k.toUpperCase() : k;
        if (mainKey === ' ') mainKey = 'Space';
        parts.push(mainKey);
        return parts.join('+');
    }

    function executeShortcutAction(actionKey) {
        if (actionKey === 'questOnly') {
            if (window.__lcSetQuestOnlyMode) {
                window.__lcSetQuestOnlyMode(!cfg.QuestOnlyModeActive, true);
            }
        } else if (actionKey === 'questFloating') {
            if (cfg.QuestOnlyModeActive) {
                window.__lcSetQuestOnlyMode(false, true);
            }
            cfg.QuestCompleterInstalled = true;
            if (!cfg.QuestHelperEnabled) {
                cfg.QuestHelperEnabled = true;
                isQuestCollapsed = false;
            } else if (!isQuestCollapsed) {
                isQuestCollapsed = true;
            } else {
                isQuestCollapsed = false;
            }
            applyQuestOnlyWorkspaceLayout();
            setQuestCollapsedState(isQuestCollapsed);
            syncMenuSwitches();
            sendHost('TOGGLE_QUEST_HELPER');
        } else if (actionKey === 'configMenu') {
            if (window.__litecordToggleMenu) window.__litecordToggleMenu();
        } else if (actionKey === 'shortcutsMenu') {
            openKeyboardShortcutsModal(true);
        } else if (actionKey === 'restartApp') {
            const rBtn = document.getElementById('dd-row-restart');
            if (rBtn) rBtn.click();
            else sendHost('RESTART_APP');
        } else if (actionKey === 'quitApp') {
            const qBtn = document.getElementById('dd-row-exit');
            if (qBtn) qBtn.click();
            else sendHost('EXIT_APP');
        }
    }

    function openKeyboardShortcutsModal(toggleIfOpen) {
        if (!document.body) return;
        loadSavedShortcuts();
        if (!shortcutsModalEl || !shortcutsModalEl.isConnected) {
            shortcutsModalEl = document.createElement('div');
            shortcutsModalEl.id = 'lc-shortcuts-modal';
            shortcutsModalEl.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.65);display:none;align-items:center;justify-content:center;user-select:none;font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;';
            document.body.appendChild(shortcutsModalEl);
        } else if (toggleIfOpen && shortcutsModalEl.style.display === 'flex') {
            shortcutsModalEl.style.display = 'none';
            recordingShortcutKey = null;
            updateTitleBarElements();
            return;
        }

        const renderModalContent = (statusMsg = '', isWarn = false) => {
            const rows = [
                {
                    key: 'questOnly',
                    icon: MSR.target,
                    title: 'Quest Completer Interface',
                    desc: 'Switch between Full Discord and Quests-Only Workspace'
                },
                {
                    key: 'questFloating',
                    icon: MSR.bolt,
                    title: 'Quest Completer Floating Window',
                    desc: 'Show, expand, or collapse the floating Quest Completer HUD'
                },
                {
                    key: 'configMenu',
                    icon: MSR.tune,
                    title: 'Summoning Configurations',
                    desc: 'Open or close the DisCRust Configurations menu'
                },
                {
                    key: 'shortcutsMenu',
                    icon: MSR.keyboard,
                    title: 'The Keyboard Shortcuts Menu',
                    desc: 'Open or close this Keyboard Shortcuts & Remapping window'
                },
                {
                    key: 'restartApp',
                    icon: MSR.restart,
                    title: 'Restarting App',
                    desc: 'Prompt to restart DisCRust cleanly'
                },
                {
                    key: 'quitApp',
                    icon: MSR.exit,
                    title: 'Quitting App',
                    desc: 'Prompt to quit DisCRust completely'
                }
            ];

            let rowsHtml = '';
            for (const r of rows) {
                const isRec = (recordingShortcutKey === r.key);
                const curCombo = getShortcutLabel(r.key);
                const pillBg = isRec ? 'rgba(88,101,242,0.28)' : '#18191c';
                const pillBorder = isRec ? '#5865f2' : 'rgba(255,255,255,0.12)';
                const pillText = isRec ? 'Press keys... (Esc)' : escapeHtmlSafe(curCombo);
                const pillColor = isRec ? '#a5b4fc' : '#f2f3f5';

                rowsHtml += `
                    <div class='lc-dd-item' style='cursor:default;padding:10px 13px;'>
                        <div class='lc-dd-left'>
                            <span class='lc-dd-icon' style='color:#a5b4fc;'>${r.icon}</span>
                            <div class='lc-dd-text'>
                                <div class='lc-dd-label'>${r.title}</div>
                                <div class='lc-dd-desc'>${r.desc}</div>
                            </div>
                        </div>
                        <div style='display:flex;align-items:center;gap:6px;flex-shrink:0;'>
                            <button class='lc-sc-remap-btn' data-sckey='${r.key}' title='Click and press a new key combination' style='min-width:108px;height:28px;padding:0 10px;border-radius:6px;background:${pillBg};border:1px solid ${pillBorder};color:${pillColor};font-size:11.5px;font-weight:700;font-family:Consolas, monospace;cursor:pointer;'>
                                ${pillText}
                            </button>
                            <button class='lc-subtle-btn lc-sc-run-btn' data-sckey='${r.key}' title='Trigger action now' style='height:28px;padding:0 9px;font-size:11px;'>Run</button>
                        </div>
                    </div>
                `;
            }

            shortcutsModalEl.innerHTML = `
                <div id='lc-sc-card' style='width:min(480px, calc(100vw - 24px));background:#1e1f22;border:1px solid rgba(255,255,255,0.08);border-radius:12px;box-shadow:0 22px 54px rgba(0,0,0,0.78);color:#dbdee1;display:flex;flex-direction:column;overflow:hidden;animation:lcModalFadeIn 0.16s cubic-bezier(0.16, 1, 0.3, 1);'>
                    <div id='lc-sc-drag-hdr' style='padding:12px 16px;background:#18191c;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;cursor:grab;'>
                        <div style='display:flex;align-items:center;gap:8px;'>
                            <span style='color:#a5b4fc;display:flex;'>${MSR.keyboard}</span>
                            <div>
                                <div style='font-size:13.5px;font-weight:700;color:#f2f3f5;'>Keyboard Shortcuts &amp; Remapping</div>
                                <div style='font-size:11px;color:#80848e;'>Click any keybind pill to remap &bull; Conflict-free with Discord</div>
                            </div>
                        </div>
                        <button id='lc-sc-close-btn' class='lc-menu-close-btn' title='Close (Esc)'>${MSR.winClose}</button>
                    </div>

                    <div style='padding:14px 16px;display:flex;flex-direction:column;gap:10px;'>
                        <div class='lc-group-card' style='margin-bottom:0;'>
                            ${rowsHtml}
                        </div>
                        <div id='lc-sc-status-bar' style='min-height:18px;font-size:11px;color:${isWarn ? '#f0b232' : '#57e389'};padding:0 2px;'>
                            ${escapeHtmlSafe(statusMsg || 'Tip: Default Alt+Letter shortcuts never conflict with Discord shortcuts.')}
                        </div>
                    </div>

                    <div style='padding:10px 16px;background:#18191c;border-top:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;'>
                        <button id='lc-sc-reset-btn' class='lc-subtle-btn' style='height:28px;padding:0 12px;'>Reset Defaults</button>
                        <button id='lc-sc-done-btn' class='lc-primary-btn' style='height:28px;padding:0 16px;'>Done</button>
                    </div>
                </div>
            `;

            const closeSc = () => {
                recordingShortcutKey = null;
                shortcutsModalEl.style.display = 'none';
                updateTitleBarElements();
            };

            shortcutsModalEl.querySelector('#lc-sc-close-btn').onclick = closeSc;
            shortcutsModalEl.querySelector('#lc-sc-done-btn').onclick = closeSc;
            shortcutsModalEl.onclick = (ev) => {
                if (ev.target === shortcutsModalEl) closeSc();
            };

            shortcutsModalEl.querySelector('#lc-sc-reset-btn').onclick = () => {
                recordingShortcutKey = null;
                activeShortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
                saveShortcutsConfig();
                renderModalContent('Restored default conflict-free Alt shortcuts.', false);
            };

            for (const b of shortcutsModalEl.querySelectorAll('.lc-sc-remap-btn')) {
                b.onclick = (ev) => {
                    ev.stopPropagation();
                    const k = b.getAttribute('data-sckey');
                    recordingShortcutKey = (recordingShortcutKey === k) ? null : k;
                    renderModalContent(recordingShortcutKey ? 'Press a modifier + key (e.g. Alt+Q, Ctrl+Shift+K) or F-key...' : '', false);
                };
            }

            for (const rBtn of shortcutsModalEl.querySelectorAll('.lc-sc-run-btn')) {
                rBtn.onclick = (ev) => {
                    ev.stopPropagation();
                    const k = rBtn.getAttribute('data-sckey');
                    closeSc();
                    executeShortcutAction(k);
                };
            }

            shortcutsModalEl._rerender = renderModalContent;
        };

        renderModalContent();
        shortcutsModalEl.style.display = 'flex';
        updateTitleBarElements();
    }

    // Rounded Window Frame When Not in Full-Screen / Maximized
    function ensureRoundedWindowFrameStyles() {
        if (!document.head) return;
        let st = document.getElementById('lc-rounded-window-frame-style');
        if (!st) {
            st = document.createElement('style');
            st.id = 'lc-rounded-window-frame-style';
            st.textContent = `
                html.lc-win-rounded,
                body.lc-win-rounded {
                    border-radius: 10px !important;
                    overflow: hidden !important;
                    background-clip: padding-box !important;
                }
                body.lc-win-rounded #lc-discord-titlebar {
                    border-top-left-radius: 10px !important;
                    border-top-right-radius: 10px !important;
                }
                body.lc-win-rounded::after {
                    content: '';
                    position: fixed;
                    inset: 0;
                    border-radius: 10px;
                    border: 1px solid rgba(255, 255, 255, 0.085);
                    pointer-events: none;
                    z-index: 2147483647;
                }
            `;
            document.head.appendChild(st);
        }
    }

    let lcWinIsMaximizedOrFullscreen = false;
    window.__lcSetWindowMaximizedState = (isMax) => {
        lcWinIsMaximizedOrFullscreen = !!isMax || !!document.fullscreenElement;
        ensureRoundedWindowFrameStyles();
        if (document.documentElement) {
            document.documentElement.classList.toggle('lc-win-rounded', !lcWinIsMaximizedOrFullscreen);
        }
        if (document.body) {
            document.body.classList.toggle('lc-win-rounded', !lcWinIsMaximizedOrFullscreen);
        }
    };

    function autoDetectWindowRoundedState() {
        ensureRoundedWindowFrameStyles();
        const isFullOrMax = !!document.fullscreenElement
            || lcWinIsMaximizedOrFullscreen
            || (window.innerWidth >= window.screen.availWidth - 4 && window.innerHeight >= window.screen.availHeight - 4);
        if (document.documentElement) {
            document.documentElement.classList.toggle('lc-win-rounded', !isFullOrMax);
        }
        if (document.body) {
            document.body.classList.toggle('lc-win-rounded', !isFullOrMax);
        }
    }

    window.addEventListener('resize', autoDetectWindowRoundedState);
    document.addEventListener('fullscreenchange', autoDetectWindowRoundedState);
    setTimeout(() => {
        loadSavedShortcuts();
        autoDetectWindowRoundedState();
    }, 150);

    window.addEventListener('keydown', (e) => {
        // 1. Handle active shortcut remapping capture first
        if (recordingShortcutKey && shortcutsModalEl && shortcutsModalEl.style.display === 'flex') {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape') {
                recordingShortcutKey = null;
                if (shortcutsModalEl._rerender) shortcutsModalEl._rerender('Remapping cancelled.', false);
                return;
            }
            const combo = formatKeyEventCombo(e);
            if (!combo) return;
            const isFKey = /^F([1-9]|1[0-2])$/.test(combo);
            if (!e.altKey && !e.ctrlKey && !isFKey) {
                if (shortcutsModalEl._rerender) {
                    shortcutsModalEl._rerender('Please include Alt or Ctrl (or press F1–F12) so typing in chat is unaffected.', true);
                }
                return;
            }
            if (DISCORD_RESERVED_SHORTCUTS.has(combo)) {
                if (shortcutsModalEl._rerender) {
                    shortcutsModalEl._rerender(`"${combo}" is used by Discord. Choose another key (like Alt+${e.key.toUpperCase()}).`, true);
                }
                return;
            }
            for (const otherKey of Object.keys(activeShortcuts)) {
                if (otherKey !== recordingShortcutKey && activeShortcuts[otherKey] === combo) {
                    if (shortcutsModalEl._rerender) {
                        shortcutsModalEl._rerender(`"${combo}" is already assigned to another DisCRust action.`, true);
                    }
                    return;
                }
            }
            activeShortcuts[recordingShortcutKey] = combo;
            recordingShortcutKey = null;
            saveShortcutsConfig();
            if (shortcutsModalEl._rerender) {
                shortcutsModalEl._rerender(`Saved shortcut: ${combo}`, false);
            }
            return;
        }

        // 2. Escape closes open modals/menus
        if (e.key === 'Escape') {
            if (shortcutsModalEl && shortcutsModalEl.style.display === 'flex') {
                shortcutsModalEl.style.display = 'none';
                updateTitleBarElements();
                return;
            }
            if (patchNotesModal && patchNotesModal.style.display !== 'none') {
                patchNotesModal.style.display = 'none';
                return;
            }
            if (menuOpen && menuOverlay) {
                menuOpen = false;
                menuOverlay.style.display = 'none';
                updateTitleBarElements();
                return;
            }
        }

        // 3. Match user-configured shortcuts
        const pressedCombo = formatKeyEventCombo(e);
        if (!pressedCombo) return;

        for (const actionKey of Object.keys(activeShortcuts)) {
            if (activeShortcuts[actionKey] && activeShortcuts[actionKey].toLowerCase() === pressedCombo.toLowerCase()) {
                e.preventDefault();
                e.stopPropagation();
                executeShortcutAction(actionKey);
                return;
            }
        }

        // Keep Ctrl+Shift+M quick memory clean
        if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
            e.preventDefault();
            sendHost('TRIM_MEMORY');
        }
    }, true);
})();
