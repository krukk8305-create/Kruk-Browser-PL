const { app, BrowserWindow, BrowserView, ipcMain, dialog, globalShortcut, shell } = require('electron'); 
const path = require('path');
const fs = require('fs');

let mainWindow;
let tabs = [];
let activeTab = 0;

// STAŁE DLA WYMIARÓW UI
const UI_HEIGHT = 100; 
const HOME_URL = `file://${path.join(__dirname, 'home.html')}`; 
const ADDONS_SETTINGS_URL = `file://${path.join(__dirname, 'addons_settings.html')}`; 
const DINO_RUNNER_URL = `file://${path.join(__dirname, 'dino_runner.html')}`; 
const EASTER_EGG_URL = 'kruk:runner'; 
const THEME_PATH = path.join(app.getPath('userData'), 'theme.txt');
const OGLOSZENIA_PATH = path.join(__dirname, 'ogloszenia.txt'); 
let currentTheme = 'nicosc'; 

// =========================================================
// FUNKCJE ZAPISYWANIA MOTYWU I ODCZYTU OGŁOSZEŃ
// =========================================================

function loadTheme() {
    try {
        if (fs.existsSync(THEME_PATH)) {
            currentTheme = fs.readFileSync(THEME_PATH, 'utf8').trim();
        }
    } catch (e) {
        console.error("Nie udało się załadować motywu:", e);
    }
}

function saveTheme(theme) {
    try {
        fs.writeFileSync(THEME_PATH, theme, 'utf8');
        currentTheme = theme;
    } catch (e) {
        console.error("Nie udało się zapisać motywu:", e);
    }
}

function getOgloszenia() {
    try {
        if (fs.existsSync(OGLOSZENIA_PATH)) {
            return fs.readFileSync(OGLOSZENIA_PATH, 'utf8');
        } else {
            return "Brak pliku ogłoszeń (ogloszenia.txt). Utwórz go, aby dodać treść.";
        }
    } catch (e) {
        return "Błąd podczas odczytu pliku ogłoszeń: " + e.message;
    }
}

// =========================================================
// FUNKCJE ZARZĄDZANIA KARTAMI
// =========================================================

function sendNavigationState() {
    if (mainWindow && tabs[activeTab] && tabs[activeTab].view && tabs[activeTab].view.webContents) {
        const wc = tabs[activeTab].view.webContents;
        mainWindow.webContents.send("nav-state", {
            canGoBack: wc.canGoBack(),
            canGoForward: wc.canGoForward()
        });
    } else if (mainWindow) {
         mainWindow.webContents.send("nav-state", {
            canGoBack: false,
            canGoForward: false
        });
    }
}

function sendTabs() {
    const titles = tabs.map(t => {
        let title = t.view.webContents.getTitle() || "Nowa karta";
        let urlForFavicon = t.view.webContents.getURL();
        let isHomePage = urlForFavicon.startsWith('file:///');

        if (isHomePage) {
             title = "Strona Główna";
        }
        
        let faviconUrl = '';
        try {
            if (!isHomePage && urlForFavicon.includes('://') && urlForFavicon !== HOME_URL) {
                const urlObj = new URL(urlForFavicon);
                faviconUrl = `https://s2.googleusercontent.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
            } else if (isHomePage) {
                faviconUrl = 'home-icon'; 
            }
        } catch (e) {
            // Ignorowanie błędów w url
        }
        
        return {
            title: title.substring(0, 30),
            url: urlForFavicon,
            favicon: faviconUrl
        };
    });

    if (mainWindow) {
        mainWindow.webContents.send("tabs", {
            tabs: titles,
            active: activeTab
        });
    }
}

function updateURL(url) {
    if (mainWindow) {
        const displayUrl = url.startsWith('file://') ? '' : url; 
        mainWindow.webContents.send("url-update", displayUrl);
    }
}

function setBrowserViewBounds() {
    if (!mainWindow || tabs.length === 0 || !tabs[activeTab] || !tabs[activeTab].view) return; 

    const isFullScreen = mainWindow.isFullScreen();
    const currentUIHeight = isFullScreen ? 0 : UI_HEIGHT; 
    const bounds = mainWindow.getBounds();
    
    mainWindow.setTopBrowserView(tabs[activeTab].view);

    const newBounds = {
        x: 0, // Z powrotem do 0
        y: currentUIHeight, 
        width: bounds.width, // Pełna szerokość
        height: bounds.height - currentUIHeight
    };

    tabs[activeTab].view.setBounds(newBounds);
    
    // Ukrywa nieaktywne widoki
    tabs.forEach((t, i) => {
        if (i !== activeTab) {
            t.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        }
    });

    mainWindow.webContents.send("fullscreen", isFullScreen);
}

function createTab(url) {
    const view = new BrowserView({
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true,
            nodeIntegration: false,
            session: mainWindow.webContents.session 
        }
    });

    tabs.push({ view, url });
    const newTabIndex = tabs.length - 1;

    mainWindow.addBrowserView(view); 
    switchTab(newTabIndex); 

    view.webContents.loadURL(url);

    // --- Zdarzenia wewnątrz BrowserView ---
    view.webContents.on('did-finish-load', async () => {
        if (view.webContents.getURL() === HOME_URL) {
            view.webContents.send('initial-theme-load', currentTheme); 
        }

        if (tabs[activeTab] && tabs[activeTab].view === view) {
            updateURL(view.webContents.getURL());
            sendNavigationState();
        }
        sendTabs();
    });
    
    view.webContents.on('page-title-updated', () => sendTabs());
    view.webContents.on('did-navigate', () => {
        sendTabs();
        sendNavigationState();
    });
    view.webContents.on('did-start-navigation', (_, url) => updateURL(url));
    view.webContents.on('did-stop-loading', () => sendNavigationState());

    
    // Otwieranie linków w nowej karcie
    view.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) {
            createTab(url);
        }
        return { action: 'deny' }; 
    });

    sendTabs();
}

function switchTab(index) {
     if (index < 0 || index >= tabs.length) return;

    activeTab = index;
    setBrowserViewBounds(); 

    updateURL(tabs[activeTab].view.webContents.getURL());
    sendTabs();
    sendNavigationState(); 
}

function removeTab(index) {
    if (!mainWindow || !tabs[index]) return;

    const viewToRemove = tabs[index].view;
    
    try {
        mainWindow.removeBrowserView(viewToRemove); 
        viewToRemove.webContents.close(); 
    } catch(e) {
        // Ignorowanie błędów
    }
    
    tabs.splice(index, 1);
    
    if (tabs.length === 0) return app.quit(); 
    
    const wasActive = (index === activeTab);
    
    activeTab = Math.min(activeTab, tabs.length - 1); 
    
    if (wasActive || index === activeTab) {
        setBrowserViewBounds(); 
        updateURL(tabs[activeTab].view.webContents.getURL());
        sendNavigationState(); 
    }

    sendTabs();
}

// =========================================================
// GŁÓWNA FUNKCJA INICJALIZACYJNA
// =========================================================
async function initApp() {
    
    loadTheme(); 
    
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 400,
        minHeight: 200,
        frame: false, 
        icon: path.join(__dirname, 'logo.ico'), 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), 
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: true 
        }
    });
    
    mainWindow.webContents.session.allowNTLMCredentialsForDomains('localhost');

    // Zdarzenia do obsługi zmiany rozmiaru/pełnego ekranu
    mainWindow.on('resize', setBrowserViewBounds);
    mainWindow.on('maximize', () => mainWindow.webContents.send("maximized-state", true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send("maximized-state", false));
    mainWindow.on('enter-full-screen', setBrowserViewBounds);
    mainWindow.on('leave-full-screen', setBrowserViewBounds);
    
    mainWindow.loadFile("ui.html");
    
    mainWindow.webContents.on('did-finish-load', async () => {
        createTab(HOME_URL); 
        mainWindow.webContents.send("theme-toggled", currentTheme);
    });

    globalShortcut.register("F11", () => {
        mainWindow.setFullScreen(!mainWindow.isFullScreen());
    });
    
    mainWindow.on("close", (e) => {
        const choice = dialog.showMessageBoxSync(mainWindow, {
            type: "question",
            buttons: ["Tak", "Nie"],
            title: "Potwierdzenie",
            message: "Czy na pewno chcesz zamknąć przeglądarkę?"
        });
        if (choice !== 0) e.preventDefault();
    });
    
    // --- OBSŁUGA IPC ---
    
    function handleIpcCommand(channel, data) {
        
        switch (channel) {
            case "new-tab": createTab(HOME_URL); break;
            case "remove-tab": removeTab(data); break;
            case "navigate":
                {
                    const query = data;
                    if (tabs.length === 0 || !tabs[activeTab]) return;

                    let finalUrl = query.trim().toLowerCase(); 

                    // === EASTER EGG ===
                    if (finalUrl === EASTER_EGG_URL) {
                        finalUrl = DINO_RUNNER_URL; 
                    } else {
                        // === STANDARDOWA NAWIGACJA / WYSZUKIWANIE ===
                        const isSearchQuery = finalUrl.includes(' ') || !finalUrl.includes('.');

                        if (isSearchQuery) {
                            finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
                        } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                            finalUrl = 'https://' + finalUrl;
                        }
                    }
                    
                    tabs[activeTab].view.webContents.loadURL(finalUrl);
                    updateURL(finalUrl);
                }
                break;
            case "nav":
                {
                    const dir = data;
                    if (tabs.length === 0 || !tabs[activeTab]) return;
                    
                    const wc = tabs[activeTab].view.webContents;
                    switch (dir) {
                        case "back": if (wc.canGoBack()) { wc.goBack(); } break;
                        case "forward": if (wc.canGoForward()) { wc.goForward(); } break; 
                        case "reload": 
                            if (wc.getURL() === HOME_URL) {
                                wc.reload();
                                wc.once('did-finish-load', () => wc.send('initial-theme-load', currentTheme));
                            } else {
                                wc.reload(); 
                            }
                            break;
                    }
                    setTimeout(sendNavigationState, 100); 
                }
                break;
            case "tab-click": switchTab(data); break;
            case "window-minimize": mainWindow.minimize(); break;
            case "window-maximize":
                if (mainWindow.isMaximized()) {
                    mainWindow.unmaximize();
                } else {
                    mainWindow.maximize();
                }
                setTimeout(setBrowserViewBounds, 50); 
                break;
            case "window-close": mainWindow.close(); break;
            case "save-theme":
                {
                    const theme = data;
                    saveTheme(theme); 
                    
                    if (mainWindow) {
                        mainWindow.webContents.send("theme-toggled", theme);
                    }
                    tabs.forEach(t => {
                        if (t.view && t.view.webContents.getURL().includes('home.html')) {
                             t.view.webContents.send('initial-theme-load', theme); 
                        }
                    });
                }
                break;
            case "open-chrome-addons":
                const addonsUrl = 'https://chromewebstore.google.com/'; 
                createTab(addonsUrl); 
                break;
            case "open-addons-settings":
                createTab(ADDONS_SETTINGS_URL);
                break;
            case "get-ogloszenia":
                return getOgloszenia();
        }
    }
    
    ipcMain.handle("get-ogloszenia", (event, data) => handleIpcCommand("get-ogloszenia", data));
    
    ipcMain.on("new-tab", (event, data) => handleIpcCommand("new-tab", data)); 
    ipcMain.on("remove-tab", (event, data) => handleIpcCommand("remove-tab", data));
    ipcMain.on("navigate", (event, data) => handleIpcCommand("navigate", data));
    ipcMain.on("nav", (event, data) => handleIpcCommand("nav", data));
    ipcMain.on("tab-click", (event, data) => handleIpcCommand("tab-click", data));
    ipcMain.on("window-minimize", (event, data) => handleIpcCommand("window-minimize", data));
    ipcMain.on("window-maximize", (event, data) => handleIpcCommand("window-maximize", data));
    ipcMain.on("window-close", (event, data) => handleIpcCommand("window-close", data));
    ipcMain.on("save-theme", (event, data) => handleIpcCommand("save-theme", data));
    ipcMain.on("open-chrome-addons", (event, data) => handleIpcCommand("open-chrome-addons", data)); 
    ipcMain.on("open-addons-settings", (event, data) => handleIpcCommand("open-addons-settings", data)); 
} 

app.whenReady().then(() => initApp());

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    tabs.forEach(t => {
        try {
            if (t.view && t.view.webContents) {
                t.view.webContents.close();
            }
        } catch (e) {
            // Ignorowanie błędów
        }
    });
});