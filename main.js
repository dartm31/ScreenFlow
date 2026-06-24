const { app, BrowserWindow, Tray, Menu, screen, globalShortcut, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, execSync } = require('child_process');

let tray = null;
let settingsWindow = null;
let overlayWindows = [];
let isFocusActive = false;

const configPath = path.join(app.getPath('userData'), 'config.json');
const binDir = __dirname;
const controllerCsPath = path.join(binDir, 'MonitorController.cs');
const controllerExePath = path.join(binDir, 'MonitorController.exe');

const locales = {
  es: {
    title: "ScreenFlow",
    subtitle: "Control de brillo y apagado de monitores",
    active: "Activo",
    inactive: "Inactivo",
    detectedMonitors: "Monitores Detectados",
    selectFocusScreen: "Selecciona la pantalla que deseas mantener encendida (enfocada). Las demás se apagarán o atenuarán.",
    focusModeLabel: "Modo de Apagado General",
    hybridMode: "Híbrido (Recomendado)",
    hybridDesc: "Usa DDC/CI por hardware si el monitor lo soporta, o superposición si no.",
    ddcciMode: "Solo DDC/CI (Hardware)",
    ddcciDesc: "Apaga los monitores físicamente (modo suspensión) sin desordenar ventanas.",
    overlayMode: "Solo Superposición (Software)",
    overlayDesc: "Coloca una ventana negra de pantalla completa encima de los monitores.",
    preferences: "Preferencias",
    dimLevel: "Nivel de atenuación",
    dimDesc: "Define la opacidad del overlay (100% es negro absoluto).",
    globalHotkey: "Atajo de teclado global",
    hotkeyDesc: "Haz clic e ingresa la combinación de teclas para activar/desactivar.",
    clickThrough: "Hacer clic a través de pantallas atenuadas (Click-through)",
    startup: "Iniciar con Windows",
    saveSettings: "Guardar Ajustes",
    close: "Cerrar",
    savedSuccess: "Cambios guardados con éxito",
    loadingScreens: "Escaneando pantallas...",
    languageLabel: "Idioma / Language",
    autoLang: "Automático (System Default)",
    // Tray
    trayActive: "❌ Desactivar Enfoque",
    trayInactive: "🎯 Activar Enfoque",
    focusScreen: "Pantalla de Enfoque",
    prefPerScreen: "Preferencia por Pantalla",
    generalMode: "Modo General",
    settings: "⚙️ Configuración...",
    quit: "Salir",
    auto: "Automático",
    forceDdcci: "Forzar DDC/CI (Apagado físico)",
    forceOverlay: "Forzar Superposición (Pantalla negra)",
    ddcCompatible: "⚡ DDC/CI compatible",
    ddcNotCompatible: "⚠️ No compatible con DDC/CI",
  },
  en: {
    title: "ScreenFlow",
    subtitle: "Monitor power and brightness control",
    active: "Active",
    inactive: "Inactive",
    detectedMonitors: "Detected Monitors",
    selectFocusScreen: "Select the screen you want to keep on (focused). The others will turn off or dim.",
    focusModeLabel: "General Power Off Mode",
    hybridMode: "Hybrid (Recommended)",
    hybridDesc: "Uses hardware DDC/CI if supported, otherwise software overlay.",
    ddcciMode: "DDC/CI Only (Hardware)",
    ddcciDesc: "Turns off monitors physically (standby mode) without messing up windows.",
    overlayMode: "Overlay Only (Software)",
    overlayDesc: "Places a fullscreen black window on top of the monitors.",
    preferences: "Preferences",
    dimLevel: "Dimming level",
    dimDesc: "Defines overlay opacity (100% is absolute black).",
    globalHotkey: "Global keyboard shortcut",
    hotkeyDesc: "Click and press the key combination to toggle focus mode.",
    clickThrough: "Click through dimmed screens (Click-through)",
    startup: "Start with Windows",
    saveSettings: "Save Settings",
    close: "Close",
    savedSuccess: "Changes saved successfully",
    loadingScreens: "Scanning screens...",
    languageLabel: "Idioma / Language",
    autoLang: "Automatic (System Default)",
    // Tray
    trayActive: "❌ Deactivate Focus",
    trayInactive: "🎯 Activate Focus",
    focusScreen: "Focus Screen",
    prefPerScreen: "Preference per Screen",
    generalMode: "General Mode",
    settings: "⚙️ Settings...",
    quit: "Quit",
    auto: "Automatic",
    forceDdcci: "Force DDC/CI (Physical Power Off)",
    forceOverlay: "Force Overlay (Black screen)",
    ddcCompatible: "⚡ DDC/CI compatible",
    ddcNotCompatible: "⚠️ Not DDC/CI compatible",
  }
};

let config = {
  focusMonitorDevice: '', // Device name, e.g., \\.\DISPLAY1
  focusMode: 'hybrid', // 'ddcci', 'overlay', 'hybrid'
  dimLevel: 100, // 50 to 100
  clickThrough: false,
  hotkey: 'Ctrl+Alt+F',
  runAtStartup: false,
  monitorPreferences: {}, // { '\\\\.\\DISPLAY1': 'auto'/'ddcci'/'overlay' }
  language: 'auto' // 'auto', 'es', 'en'
};

function getLang() {
  if (config.language === 'es') return 'es';
  if (config.language === 'en') return 'en';
  // Auto detect
  const locale = app.getLocale() || 'en';
  return locale.startsWith('es') ? 'es' : 'en';
}

function setMonitorPreference(device, pref) {
  const prefs = config.monitorPreferences || {};
  prefs[device] = pref;
  saveConfig({ monitorPreferences: prefs });
}

// Check if MonitorController.exe exists, compile if needed
function checkAndCompileController() {
  if (!fs.existsSync(controllerExePath)) {
    console.log('MonitorController.exe not found. Compiling MonitorController.cs...');
    try {
      const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
      if (fs.existsSync(cscPath)) {
        execSync(`"${cscPath}" /r:System.Management.dll /out:"${controllerExePath}" "${controllerCsPath}"`);
        console.log('MonitorController.exe compiled successfully.');
      } else {
        console.warn('csc.exe not found. DDC/CI hardware power off will be unavailable (falling back to overlays).');
      }
    } catch (err) {
      console.error('Failed to compile MonitorController.cs:', err);
    }
  }
}

// Run compiled MonitorController.exe
function runController(args) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(controllerExePath)) {
      reject(new Error('Controller executable not found.'));
      return;
    }
    execFile(controllerExePath, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Get the list of physical monitors
async function getSystemMonitors() {
  try {
    const output = await runController(['list']);
    return JSON.parse(output);
  } catch (err) {
    console.warn('Could not run MonitorController list, falling back to Electron screens:', err.message);
    // Fallback: list monitors using Electron API
    return screen.getAllDisplays().map((disp, idx) => ({
      device: `\\\\.\\DISPLAY${idx + 1}`,
      description: `Display ${idx + 1}`,
      isPrimary: disp.bounds.x === 0 && disp.bounds.y === 0,
      ddcciSupported: false,
      bounds: {
        left: disp.bounds.x,
        top: disp.bounds.y,
        right: disp.bounds.x + disp.bounds.width,
        bottom: disp.bounds.y + disp.bounds.height
      }
    }));
  }
}

// Match Windows physical monitor to Electron Display spatially
function getElectronDisplayForMonitor(mon, monitors, electronDisplays) {
  // Sort both arrays left-to-right, then top-to-bottom
  const sortedCsharp = [...monitors].sort((a, b) => {
    if (a.bounds.left !== b.bounds.left) return a.bounds.left - b.bounds.left;
    return a.bounds.top - b.bounds.top;
  });
  const sortedElectron = [...electronDisplays].sort((a, b) => {
    if (a.bounds.x !== b.bounds.x) return a.bounds.x - b.bounds.x;
    return a.bounds.y - b.bounds.y;
  });

  const idx = sortedCsharp.findIndex(m => m.device.toLowerCase() === mon.device.toLowerCase());
  if (idx !== -1 && idx < sortedElectron.length) {
    return sortedElectron[idx];
  }
  return null;
}

// Create solid color overlay window on a monitor
function createOverlayForMonitor(mon, monitors) {
  const electronDisplays = screen.getAllDisplays();
  const display = getElectronDisplayForMonitor(mon, monitors, electronDisplays);

  if (!display) {
    console.error('Could not find matching Electron display for monitor:', mon.device);
    return;
  }

  // Check if overlay already exists for this display
  if (overlayWindows.some(w => w.displayId === display.id)) {
    return;
  }

  const { x, y, width, height } = display.bounds;

  const overlayWin = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreen: true,
    enableLargerThanScreen: true,
    titleBarStyle: 'hidden',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load black background content
  overlayWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100vw;
            height: 100vh;
            background-color: black;
            overflow: hidden;
            user-select: none;
            cursor: none;
          }
        </style>
      </head>
      <body></body>
    </html>
  `)}`);

  // Set opacity based on dimLevel (value 50 to 100 mapped to 0.5 to 1.0)
  overlayWin.setOpacity(config.dimLevel / 100);

  // Set ignore mouse events if click-through is enabled
  if (config.clickThrough) {
    overlayWin.setIgnoreMouseEvents(true);
  } else {
    overlayWin.setIgnoreMouseEvents(false);
  }

  // Ensure window is topmost and overlay is robust
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true);

  overlayWindows.push({
    displayId: display.id,
    window: overlayWin
  });
}

function destroyAllOverlays() {
  for (const item of overlayWindows) {
    if (item.window && !item.window.isDestroyed()) {
      item.window.destroy();
    }
  }
  overlayWindows = [];
}

// Apply focus state based on current configuration
async function applyFocusState() {
  const monitors = await getSystemMonitors();
  
  let targetFocusDevice = config.focusMonitorDevice;
  if (!targetFocusDevice) {
    const primary = monitors.find(m => m.isPrimary) || monitors[0];
    if (primary) targetFocusDevice = primary.device;
  }

  if (isFocusActive) {
    console.log(`Enabling focus mode on: ${targetFocusDevice}`);
    for (const mon of monitors) {
      if (mon.device.toLowerCase() === targetFocusDevice.toLowerCase()) {
        // Ensure the focused screen is awake (Power On = 1)
        const pref = (config.monitorPreferences && config.monitorPreferences[mon.device]) || 'auto';
        if (mon.ddcciSupported || pref === 'ddcci') {
          try {
            await runController(['set-power', mon.device, '1']);
          } catch (e) {
            console.error(`Failed to wake up focused monitor ${mon.device}:`, e);
          }
        }
        continue;
      }

      // Determine method to dim/turn off this screen
      const pref = (config.monitorPreferences && config.monitorPreferences[mon.device]) || 'auto';
      let useDdcci = false;
      
      if (pref === 'ddcci') {
        useDdcci = true;
      } else if (pref === 'overlay') {
        useDdcci = false;
      } else {
        // Auto
        useDdcci = (config.focusMode === 'ddcci' || config.focusMode === 'hybrid') && mon.ddcciSupported;
      }

      if (useDdcci) {
        // Power off via DDC/CI VCP Code 0xD6 -> 4
        try {
          await runController(['set-power', mon.device, '4']);
        } catch (e) {
          console.error(`DDC/CI Turn Off failed for ${mon.device}, falling back to overlay:`, e);
          createOverlayForMonitor(mon, monitors);
        }
      } else {
        // Fallback or selected Overlay method
        createOverlayForMonitor(mon, monitors);
      }
    }
  } else {
    console.log('Disabling focus mode. Restoring all displays.');
    destroyAllOverlays();
    for (const mon of monitors) {
      const pref = (config.monitorPreferences && config.monitorPreferences[mon.device]) || 'auto';
      if (mon.ddcciSupported || pref === 'ddcci') {
        try {
          await runController(['set-power', mon.device, '1']);
        } catch (e) {
          console.error(`DDC/CI Turn On failed for ${mon.device}:`, e);
        }
      }
    }
  }
}

// Toggle focus state
function toggleFocus() {
  isFocusActive = !isFocusActive;
  applyFocusState();
  updateTrayMenu();
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('focus-status-changed', isFocusActive);
  }
}

// Global hotkeys
function registerGlobalHotkey() {
  globalShortcut.unregisterAll();
  if (config.hotkey) {
    try {
      globalShortcut.register(config.hotkey, () => {
        toggleFocus();
      });
      console.log(`Global hotkey registered: ${config.hotkey}`);
    } catch (err) {
      console.error(`Failed to register global hotkey ${config.hotkey}:`, err);
    }
  }
}

// Load configurations from JSON
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      config = { ...config, ...JSON.parse(data) };
      console.log('Config loaded successfully:', config);
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

// Save configuration and apply
function saveConfig(newConfig) {
  if (newConfig && typeof newConfig === 'object') {
    const allowedKeys = ['focusMonitorDevice', 'focusMode', 'dimLevel', 'clickThrough', 'hotkey', 'runAtStartup', 'language', 'monitorPreferences'];
    for (const key of allowedKeys) {
      if (key in newConfig) {
        if (key === 'monitorPreferences') {
          if (newConfig.monitorPreferences && typeof newConfig.monitorPreferences === 'object' && !Array.isArray(newConfig.monitorPreferences)) {
            config.monitorPreferences = config.monitorPreferences || {};
            for (const mKey in newConfig.monitorPreferences) {
              if (Object.prototype.hasOwnProperty.call(newConfig.monitorPreferences, mKey)) {
                const val = newConfig.monitorPreferences[mKey];
                if (typeof val === 'string') {
                  config.monitorPreferences[mKey] = val;
                }
              }
            }
          }
        } else {
          config[key] = newConfig[key];
        }
      }
    }
  }
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('Config saved:', config);
  } catch (err) {
    console.error('Failed to save config:', err);
  }

  registerGlobalHotkey();
  if (isFocusActive) {
    applyFocusState(); // Refresh if active
  }

  // Handle Startup setting
  app.setLoginItemSettings({
    openAtLogin: config.runAtStartup,
    path: app.getPath('exe')
  });

  updateTrayMenu();
  
  // Inform settings UI of potential language changes
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('config-updated', { ...config, resolvedLanguage: getLang() });
  }
}

// System tray creation and menu
function createTray() {
  const assetsDir = path.join(__dirname, 'src', 'assets');
  const logoPath = path.join(assetsDir, 'logo.png');
  let iconImage = null;

  if (fs.existsSync(logoPath)) {
    try {
      iconImage = nativeImage.createFromPath(logoPath);
      if (iconImage.isEmpty()) {
        iconImage = null;
      }
    } catch (e) {
      console.warn('Failed to load logo.png for tray, using fallback:', e);
    }
  }

  if (!iconImage) {
    // Fallback: 16x16 target PNG (fully valid base64)
    const fallbackDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH5AYLChwY0Q4/IQAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLm4kAAAAFklEQVQ4y2NgGAVDADAaVUYtGLVgFAMAHzEAAf7JtVEAAAAASUVORK5CYII=';
    iconImage = nativeImage.createFromDataURL(fallbackDataUrl);
  }

  tray = new Tray(iconImage);
  tray.setToolTip('ScreenFlow');

  tray.on('click', () => {
    toggleFocus();
  });

  updateTrayMenu();
}

async function updateTrayMenu() {
  if (!tray) return;

  const monitors = await getSystemMonitors();
  let targetFocusDevice = config.focusMonitorDevice;
  if (!targetFocusDevice) {
    const primary = monitors.find(m => m.isPrimary) || monitors[0];
    if (primary) targetFocusDevice = primary.device;
  }

  const t = locales[getLang()];
  tray.setToolTip(t.title);

  const monitorSubmenu = monitors.map(mon => {
    return {
      label: `${mon.description} (${mon.device})${mon.isPrimary ? ' [Primary/Principal]' : ''}`,
      type: 'radio',
      checked: targetFocusDevice.toLowerCase() === mon.device.toLowerCase(),
      click: () => {
        saveConfig({ focusMonitorDevice: mon.device });
      }
    };
  });

  const preferencesSubmenu = monitors.map(mon => {
    const currentPref = (config.monitorPreferences && config.monitorPreferences[mon.device]) || 'auto';
    const statusText = mon.ddcciSupported ? t.ddcCompatible : t.ddcNotCompatible;
    return {
      label: `${mon.description} (${mon.device.replace('\\\\.\\', '')}) [${statusText}]`,
      submenu: [
        {
          label: t.auto,
          type: 'radio',
          checked: currentPref === 'auto',
          click: () => setMonitorPreference(mon.device, 'auto')
        },
        {
          label: t.forceDdcci,
          type: 'radio',
          checked: currentPref === 'ddcci',
          click: () => setMonitorPreference(mon.device, 'ddcci')
        },
        {
          label: t.forceOverlay,
          type: 'radio',
          checked: currentPref === 'overlay',
          click: () => setMonitorPreference(mon.device, 'overlay')
        }
      ]
    };
  });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isFocusActive ? t.trayActive : t.trayInactive,
      click: () => {
        toggleFocus();
      }
    },
    { type: 'separator' },
    {
      label: t.focusScreen,
      submenu: monitorSubmenu
    },
    {
      label: t.prefPerScreen,
      submenu: preferencesSubmenu
    },
    {
      label: t.generalMode,
      submenu: [
        {
          label: t.hybridMode,
          type: 'radio',
          checked: config.focusMode === 'hybrid',
          click: () => saveConfig({ focusMode: 'hybrid' })
        },
        {
          label: t.ddcciMode,
          type: 'radio',
          checked: config.focusMode === 'ddcci',
          click: () => saveConfig({ focusMode: 'ddcci' })
        },
        {
          label: t.overlayMode,
          type: 'radio',
          checked: config.focusMode === 'overlay',
          click: () => saveConfig({ focusMode: 'overlay' })
        }
      ]
    },
    { type: 'separator' },
    {
      label: t.settings,
      click: () => {
        openSettingsWindow();
      }
    },
    { type: 'separator' },
    {
      label: t.quit,
      click: () => {
        isFocusActive = false;
        applyFocusState().then(() => {
          app.quit();
        }).catch(() => {
          app.quit();
        });
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// Open settings configuration window
function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 520,
    title: 'ScreenFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false,
    resizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0e1d'
  });

  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    openSettingsWindow();
  });

  app.whenReady().then(() => {
    loadConfig();
    checkAndCompileController();
    createTray();
    registerGlobalHotkey();

    app.on('window-all-closed', (e) => {
      e.preventDefault(); // Keep app running in tray when window is closed
    });
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  destroyAllOverlays();
});
proc = require('process');
proc.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// IPC Handler registration
ipcMain.handle('get-config', () => ({ ...config, resolvedLanguage: getLang() }));
ipcMain.handle('save-config', (event, newConfig) => {
  saveConfig(newConfig);
  return true;
});
ipcMain.handle('get-monitors', async () => {
  return await getSystemMonitors();
});
ipcMain.handle('toggle-focus', () => {
  toggleFocus();
  return isFocusActive;
});
ipcMain.handle('get-focus-status', () => isFocusActive);
ipcMain.handle('get-translations', () => locales);
