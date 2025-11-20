document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------
    // 1. ZARZĄDZANIE KARTAMI (TABS)
    // ----------------------------------------------------------------
    
    const tabsContainer = document.getElementById('tabs-container');
    const navbarInput = document.getElementById('navbar-input');
    const navBack = document.getElementById('nav-back');
    const navForward = document.getElementById('nav-forward');
    const navReload = document.getElementById('nav-reload');
    const newTabButton = document.getElementById('new-tab-button');
    const settingsButton = document.getElementById('settings-button');
    const settingsMenu = document.getElementById('settings-menu');
    
    // Obsługa kliknięcia karty
    tabsContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab-item');
        if (tab) {
            const index = parseInt(tab.dataset.index);
            if (e.target.classList.contains('close-tab')) {
                window.krukAPI.send('remove-tab', index);
            } else {
                window.krukAPI.send('tab-click', index);
            }
        }
    });

    // Obsługa przycisku nowej karty
    newTabButton.addEventListener('click', () => {
        window.krukAPI.send('new-tab');
    });

    // Obsługa paska adresu (Enter)
    navbarInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            window.krukAPI.send('navigate', navbarInput.value);
        }
    });

    // Obsługa przycisków nawigacyjnych
    navBack.addEventListener('click', () => window.krukAPI.send('nav', 'back'));
    navForward.addEventListener('click', () => window.krukAPI.send('nav', 'forward'));
    navReload.addEventListener('click', () => window.krukAPI.send('nav', 'reload'));

    // ----------------------------------------------------------------
    // 2. ODBIÓR DANYCH Z MAIN PROCESS (IPC)
    // ----------------------------------------------------------------
    
    // Odbiór aktualizacji kart
    window.krukAPI.on('tabs', ({ tabs, active }) => {
        tabsContainer.innerHTML = '';
        tabs.forEach((tab, index) => {
            const isActive = index === active;
            const tabElement = document.createElement('div');
            tabElement.className = `tab-item ${isActive ? 'active' : ''}`;
            tabElement.dataset.index = index;
            tabElement.innerHTML = `
                <span class="tab-title">${tab.title}</span>
                <button class="close-tab">x</button>
            `;
            tabsContainer.appendChild(tabElement);
        });
    });

    // Odbiór aktualizacji paska adresu
    window.krukAPI.on('url-update', (url) => {
        navbarInput.value = url;
    });

    // Odbiór aktualizacji stanu nawigacji (Wstecz/Dalej)
    window.krukAPI.on('nav-state', ({ canGoBack, canGoForward }) => {
        navBack.disabled = !canGoBack;
        navForward.disabled = !canGoForward;
    });

    // Odbiór aktualizacji motywu
    window.krukAPI.on('theme-updated', (theme) => {
        document.body.className = '';
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else if (theme === 'bezkres') {
            document.body.classList.add('bezkres-theme');
        }
    });

    // ----------------------------------------------------------------
    // 3. OBSŁUGA MENU USTAWIEŃ (LOKALNIE)
    // ----------------------------------------------------------------
    
    settingsButton.addEventListener('click', () => {
        settingsMenu.classList.toggle('visible');
    });

    // Przełączanie motywów (wysyła komendę do Main Process)
    document.querySelectorAll('.theme-option').forEach(item => {
        item.addEventListener('click', () => {
            const theme = item.dataset.theme;
            window.krukAPI.send('settings:toggle-theme', theme);
            settingsMenu.classList.remove('visible');
        });
    });

    // Obsługa linków wewnętrznych
    document.querySelectorAll('.internal-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const internalUrl = e.target.dataset.url;
            window.krukAPI.send('nav:open-internal', internalUrl);
            settingsMenu.classList.remove('visible');
        });
    });

    // ----------------------------------------------------------------
    // 4. OBSŁUGA MENU KONTEKSTOWEGO (NOWOŚĆ)
    // ----------------------------------------------------------------
    
    // Przechwycenie prawego kliknięcia na całym oknie (gdzie jest UI)
    document.body.addEventListener('contextmenu', (e) => {
        // Zapobiegamy wyświetlaniu domyślnego menu kontekstowego Chrome (dla Electron UI)
        e.preventDefault(); 
        
        // Wysyłamy do preload/main process informację o kliknięciu i koordynaty
        window.krukAPI.showContextMenu(e.x, e.y);
    });

});