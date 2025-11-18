const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('krukAPI', {
    // Wysyła jednokierunkowe wiadomości do main.js
    send: (channel, data) => {
        const validSendChannels = [
            'new-tab', 'remove-tab', 'navigate', 'nav', 'tab-click',
            'window-minimize', 'window-maximize', 'window-close',
            'save-theme', 'open-chrome-addons', 'open-addons-settings'
        ];
        if (validSendChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    
    // Odbiera wiadomości z main.js
    on: (channel, func) => {
        const validReceiveChannels = ['tabs', 'url-update', 'nav-state', 'fullscreen', 'maximized-state', 'theme-toggled', 'initial-theme-load'];
        if (validReceiveChannels.includes(channel)) {
            // Uniemożliwienie modyfikacji argumentów
            const subscription = (event, ...args) => func(...args);
            ipcRenderer.on(channel, subscription);
            return () => ipcRenderer.removeListener(channel, subscription);
        }
    },
    
    // Wysyła i oczekuje na odpowiedź z main.js (dwukierunkowa komunikacja)
    invoke: (channel, data) => {
        const validInvokeChannels = ['get-ogloszenia'];
        if (validInvokeChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, data);
        }
    }
});