let localConfig = {};
let detectedMonitors = [];
let selectedMonitorDevice = '';
let translations = {};

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// DOM Elements
const toggleFocusBtn = document.getElementById('toggle-focus-btn');
const refreshMonitorsBtn = document.getElementById('refresh-monitors-btn');
const monitorMap = document.getElementById('monitor-map');
const dimLevelSlider = document.getElementById('dim-level');
const dimValSpan = document.getElementById('dim-val');
const hotkeyInput = document.getElementById('hotkey-input');
const clearHotkeyBtn = document.getElementById('clear-hotkey-btn');
const languageSelect = document.getElementById('language-select');
const clickThroughCheck = document.getElementById('click-through-check');
const startupCheck = document.getElementById('startup-check');
const saveBtn = document.getElementById('save-btn');
const closeBtn = document.getElementById('close-btn');
const toastMessage = document.getElementById('toast-message');

// Initialize settings
async function init() {
  try {
    // 1. Fetch configs and translations
    localConfig = await window.api.getConfig();
    translations = await window.api.getTranslations();
    selectedMonitorDevice = localConfig.focusMonitorDevice;

    // 2. Apply translation on load
    applyLanguage(localConfig.resolvedLanguage);

    // 3. Set UI values
    document.getElementById('focus-mode-select').value = localConfig.focusMode;
    dimLevelSlider.value = localConfig.dimLevel;
    dimValSpan.textContent = `${localConfig.dimLevel}%`;
    clickThroughCheck.checked = localConfig.clickThrough;
    startupCheck.checked = localConfig.runAtStartup;
    languageSelect.value = localConfig.language;
    
    // Set hotkey input display
    hotkeyInput.value = localConfig.hotkey || (localConfig.resolvedLanguage === 'es' ? 'Ninguno' : 'None');

    // Toggle status button
    const isFocusActive = await window.api.getFocusStatus();
    updateFocusStatusUI(isFocusActive);

    // 4. Load and draw monitor layout
    await refreshMonitors();

  } catch (err) {
    console.error('Initialization error:', err);
  }
}

// Apply translation strings
function applyLanguage(lang) {
  const t = translations[lang] || translations['en'];
  
  // Translate standard data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      el.textContent = t[key];
    }
  });

  // Translate specific standalone controls
  clearHotkeyBtn.textContent = lang === 'es' ? 'Borrar' : 'Clear';
  refreshMonitorsBtn.title = lang === 'es' ? 'Refrescar pantallas' : 'Refresh screens';
  
  if (hotkeyInput.value === 'Ninguno' || hotkeyInput.value === 'None') {
    hotkeyInput.value = lang === 'es' ? 'Ninguno' : 'None';
  }
}

// Update status button UI
function updateFocusStatusUI(isFocusActive) {
  const lang = localConfig.resolvedLanguage || 'es';
  const label = isFocusActive ? 
    (lang === 'es' ? 'Activo' : 'Active') : 
    (lang === 'es' ? 'Inactivo' : 'Inactive');

  if (isFocusActive) {
    toggleFocusBtn.className = 'status-btn activated';
    toggleFocusBtn.querySelector('.label').textContent = label;
  } else {
    toggleFocusBtn.className = 'status-btn deactivated';
    toggleFocusBtn.querySelector('.label').textContent = label;
  }
}

// Fetch and draw monitors list
async function refreshMonitors() {
  const lang = localConfig.resolvedLanguage || 'es';
  const loadingText = lang === 'es' ? 'Escaneando pantallas...' : 'Scanning screens...';
  const errorText = lang === 'es' ? 'Error al escanear pantallas.' : 'Error scanning screens.';

  monitorMap.innerHTML = `<div class="loading-state">${loadingText}</div>`;
  try {
    detectedMonitors = await window.api.getMonitors();
    
    // Set default focused monitor if empty
    if (!selectedMonitorDevice) {
      const primary = detectedMonitors.find(m => m.isPrimary) || detectedMonitors[0];
      if (primary) {
        selectedMonitorDevice = primary.device;
      }
    }
    
    drawMonitorMap();
  } catch (err) {
    console.error('Error listing monitors:', err);
    monitorMap.innerHTML = `<div class="loading-state" style="color:var(--danger)">${errorText}</div>`;
  }
}

// Draw visual layout of monitors scaled to fit container
function drawMonitorMap() {
  monitorMap.innerHTML = '';
  
  const lang = localConfig.resolvedLanguage || 'es';
  const noScreensText = lang === 'es' ? 'No se encontraron pantallas.' : 'No screens found.';

  if (detectedMonitors.length === 0) {
    monitorMap.innerHTML = `<div class="loading-state">${noScreensText}</div>`;
    return;
  }

  // Find boundaries to scale coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  detectedMonitors.forEach(m => {
    if (m.bounds.left < minX) minX = m.bounds.left;
    if (m.bounds.top < minY) minY = m.bounds.top;
    if (m.bounds.right > maxX) maxX = m.bounds.right;
    if (m.bounds.bottom > maxY) maxY = m.bounds.bottom;
  });

  const layoutW = maxX - minX;
  const layoutH = maxY - minY;

  // Fit inside container (leaving margin)
  const containerW = monitorMap.clientWidth || 600;
  const containerH = monitorMap.clientHeight || 150;
  const margin = 20;

  const scaleX = (containerW - margin * 2) / layoutW;
  const scaleY = (containerH - margin * 2) / layoutH;
  const scale = Math.min(scaleX, scaleY);

  // Center alignment offset
  const offsetX = (containerW - layoutW * scale) / 2;
  const offsetY = (containerH - layoutH * scale) / 2;

  detectedMonitors.forEach((mon, index) => {
    const w = (mon.bounds.right - mon.bounds.left) * scale;
    const h = (mon.bounds.bottom - mon.bounds.top) * scale;
    const x = (mon.bounds.left - minX) * scale + offsetX;
    const y = (mon.bounds.top - minY) * scale + offsetY;

    const isSelected = selectedMonitorDevice.toLowerCase() === mon.device.toLowerCase();

    const el = document.createElement('div');
    el.className = `monitor-element ${isSelected ? 'focused' : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;

    // Make screen display name cleaner
    const deviceClean = mon.device.replace('\\\\.\\', '');
    const ddcTag = lang === 'es' ? '⚡ DDC/CI' : '⚡ DDC/CI';
    
    const safeDesc = escapeHtml(mon.description);
    const safeDevice = escapeHtml(deviceClean);

    el.innerHTML = `
      <span class="mon-id">${index + 1}</span>
      <span class="mon-name" title="${safeDesc}">${safeDesc}</span>
      <span class="tag">${safeDevice}${mon.isPrimary ? ' (P)' : ''}</span>
      ${mon.ddcciSupported ? `<span class="ddcci-badge" title="DDC/CI Soportado">${ddcTag}</span>` : ''}
    `;

    el.addEventListener('click', () => {
      selectedMonitorDevice = mon.device;
      drawMonitorMap();
    });

    monitorMap.appendChild(el);
  });
}

// Setup Event Listeners
dimLevelSlider.addEventListener('input', (e) => {
  dimValSpan.textContent = `${e.target.value}%`;
});

// Refresh button
refreshMonitorsBtn.addEventListener('click', refreshMonitors);

// Handle window size changes to redraw monitor map
window.addEventListener('resize', () => {
  if (detectedMonitors.length > 0) {
    drawMonitorMap();
  }
});

// Toggle focus button
toggleFocusBtn.addEventListener('click', async () => {
  const isNowActive = await window.api.toggleFocus();
  updateFocusStatusUI(isNowActive);
});

// Listen to focus changes from tray
window.api.onFocusStatusChanged((isActive) => {
  updateFocusStatusUI(isActive);
});

// Listen to configuration updates from main process (including language switches)
window.api.onConfigUpdated((newConfig) => {
  localConfig = newConfig;
  applyLanguage(newConfig.resolvedLanguage);
  updateFocusStatusUI(isFocusActive);
  drawMonitorMap();
});

// Hotkey Recording
let recordingHotkey = false;

hotkeyInput.addEventListener('focus', () => {
  recordingHotkey = true;
  const lang = localConfig.resolvedLanguage || 'es';
  hotkeyInput.value = lang === 'es' ? 'Presiona combinación de teclas...' : 'Press key combination...';
  hotkeyInput.classList.add('recording');
});

hotkeyInput.addEventListener('blur', () => {
  recordingHotkey = false;
  hotkeyInput.classList.remove('recording');
  const lang = localConfig.resolvedLanguage || 'es';
  if (hotkeyInput.value === 'Presiona combinación de teclas...' || hotkeyInput.value === 'Press key combination...') {
    hotkeyInput.value = localConfig.hotkey || (lang === 'es' ? 'Ninguno' : 'None');
  }
});

hotkeyInput.addEventListener('keydown', (e) => {
  if (!recordingHotkey) return;
  
  e.preventDefault();
  e.stopPropagation();

  const keys = [];
  
  // Track modifier keys
  if (e.ctrlKey) keys.push('Ctrl');
  if (e.altKey) keys.push('Alt');
  if (e.shiftKey) keys.push('Shift');
  if (e.metaKey) keys.push('Super');

  const key = e.key;

  // Ignore solo modifiers
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    return;
  }

  // Map key code to Electron accelerator
  let electronKey = key;
  if (key === ' ') {
    electronKey = 'Space';
  } else if (key.length === 1) {
    electronKey = key.toUpperCase();
  } else if (key.startsWith('Arrow')) {
    electronKey = key.replace('Arrow', '');
  }

  keys.push(electronKey);
  
  const hotkeyString = keys.join('+');
  hotkeyInput.value = hotkeyString;
  hotkeyInput.blur();
});

clearHotkeyBtn.addEventListener('click', () => {
  const lang = localConfig.resolvedLanguage || 'es';
  hotkeyInput.value = lang === 'es' ? 'Ninguno' : 'None';
  localConfig.hotkey = '';
});

// Close button
closeBtn.addEventListener('click', () => {
  window.close();
});

// Save button
saveBtn.addEventListener('click', async () => {
  const focusMode = document.getElementById('focus-mode-select').value;
  const dimLevel = parseInt(dimLevelSlider.value);
  const clickThrough = clickThroughCheck.checked;
  const runAtStartup = startupCheck.checked;
  const language = languageSelect.value;
  
  const lang = localConfig.resolvedLanguage || 'es';
  const noneValue = lang === 'es' ? 'Ninguno' : 'None';
  const hotkey = hotkeyInput.value === noneValue ? '' : hotkeyInput.value;

  const newConfig = {
    focusMonitorDevice: selectedMonitorDevice,
    focusMode,
    dimLevel,
    clickThrough,
    runAtStartup,
    language,
    hotkey
  };

  try {
    await window.api.saveConfig(newConfig);
    
    // Show success toast
    toastMessage.classList.add('show');
    setTimeout(() => {
      toastMessage.classList.remove('show');
    }, 2500);

    localConfig = { ...localConfig, ...newConfig };
  } catch (err) {
    console.error('Error saving settings:', err);
    const alertText = lang === 'es' ? 'Error al guardar la configuración.' : 'Error saving settings.';
    alert(alertText);
  }
});

// Run init
init();
