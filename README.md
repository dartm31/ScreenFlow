# ScreenFlow

ScreenFlow is a lightweight, premium Windows system tray utility designed for multi-monitor setups. It allows you to temporarily "focus" on a single display while turning off or dimming all other monitors, creating an immersive, distraction-free environment.

Unlike default Windows screen-blanking utilities, ScreenFlow uses a hybrid approach: it physically powers off compatible monitors using low-level DDC/CI commands (putting them into standard standby mode) without disrupting your window layouts, and falls back to customizable fullscreen software overlays for monitors without hardware support.

---

## Key Features

- **⚡ Hardware Control (DDC/CI)**: Turns off compatible monitors physically using VCP Power Control codes, triggering their power-saving standby mode without moving desktop icons or windows.
- **🖥️ Software Overlay fallback**: Places a fullscreen, solid black overlay window on displays that lack DDC/CI support or when overridden by user preference.
- **🎨 Modern Settings UI**: An elegant, dark-themed settings panel featuring a real-time, scaled layout map of all connected screens, including spatial resolutions, orientation, and primary designations.
- **⌨️ Global Keyboard Shortcut**: Toggle focus mode instantly via a customizable global hotkey (default: `Ctrl+Alt+F`), or double-click the system tray icon.
- **🎯 Preference per Screen**: Customize behavior for each monitor individually (Auto-Detect, Force DDC/CI Power Off, or Force Software Overlay).
- **🔒 Click-Through Overlays**: Optional setting to allow mouse clicks to pass straight through dimmed screens so they don't block work.
- **🌐 Multilingual Support**: Automatic localization detection (Spanish & English) with manual override in settings.
- **🛡️ Secure & Zero-Dependency**: Zero third-party npm runtime dependencies. High security with context isolation, strict Content Security Policy, and sanitization protocols.

---

## How It Works (Architecture)

ScreenFlow utilizes a hybrid technology stack to bypass high-level operating system limitations:
1. **Electron Shell**: Runs the background system tray process, manages keyboard shortcuts, spawns transparent click-through overlays, and hosts the CSS-styled Settings interface.
2. **C# Low-Level Controller (`MonitorController.cs`)**: Interacts directly with Win32 APIs (`dxva2.dll`, `user32.dll`), queries local WMI providers (`WmiMonitorID`) to obtain user-friendly monitor names (e.g. *ASUS VG249* instead of *Generic PnP Monitor*), and communicates with monitor hardware via DDC/CI commands.
3. **On-the-Fly Compilation**: On launch, the Electron main process checks for the compiled C# controller executable. If missing, it compiles the C# source code dynamically using the native Windows C# compiler (`csc.exe`) included by default in the .NET Framework.

---

## Installation & Setup

### Prerequisites
- **Operating System**: Windows 10 or Windows 11.
- **Runtime**: [Node.js](https://nodejs.org/) installed.
- **Framework**: .NET Framework (v4.0 or newer, which is standard on modern Windows installations) for the C# dynamic compiler.

### Steps to Run
1. Clone this repository (or download the source code):
   ```bash
   git clone https://github.com/dartm31/ScreenFlow.git
   cd ScreenFlow
   ```
2. Install standard Electron dependencies:
   ```bash
   npm install
   ```
3. Run the application:
   ```bash
   npm start
   ```

*Note: On first startup, the application compiles `MonitorController.cs` automatically. You will see ScreenFlow's flat-screen tray icon appear in your taskbar.*

---

## Configuration & Use

- **Toggle Focus**:
  - Double-click the tray icon.
  - Or press `Ctrl+Alt+F` (configurable).
- **Settings Panel**:
  - Right-click the tray icon and select **Settings / Configuración...**
  - Select which screen to focus on by clicking it on the visual layout map.
  - Adjust the dimming opacity level (from 50% to 100% black).
  - Configure the global hotkey by focusing the hotkey input and pressing your preferred key combination.
- **Per-Screen Preferences**:
  - Right-click the tray icon, hover over **Preference per Screen**, and choose between **Automatic**, **Force DDC/CI**, or **Force Overlay** for each detected monitor.

---

## License

This project is open-source and licensed under the [ISC License](LICENSE).
