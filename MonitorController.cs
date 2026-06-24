using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Management;
using Microsoft.Win32;

public class MonitorController {
    // RECT structure
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int left, top, right, bottom;
    }

    // MONITORINFOEX structure
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct MONITORINFOEX {
        public uint cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szDevice;
    }

    // PHYSICAL_MONITOR structure
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct PHYSICAL_MONITOR {
        public IntPtr hPhysicalMonitor;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string szPhysicalMonitorDescription;
    }

    // DISPLAY_DEVICE structure for EnumDisplayDevices
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct DISPLAY_DEVICE {
        public uint cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceString;
        public uint StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string DeviceKey;
    }

    // Delegates for EnumDisplayMonitors
    public delegate bool MonitorEnumDelegate(IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData);

    // API Imports
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumDelegate lpfnEnum, IntPtr dwData);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

    [DllImport("dxva2.dll", SetLastError = true)]
    public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, ref uint pdwNumberOfPhysicalMonitors);

    [DllImport("dxva2.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint dwPhysicalMonitorArraySize, [Out] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

    [DllImport("dxva2.dll", SetLastError = true)]
    public static extern bool DestroyPhysicalMonitors(uint dwPhysicalMonitorArraySize, [In] PHYSICAL_MONITOR[] pPhysicalMonitorArray);

    [DllImport("dxva2.dll", SetLastError = true)]
    public static extern bool SetVCPFeature(IntPtr hMonitor, byte bVCPCode, uint dwNewValue);

    [DllImport("dxva2.dll", SetLastError = true)]
    public static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr hMonitor, byte bVCPCode, ref uint pvct, ref uint pdwCurrentValue, ref uint pdwMaximumValue);

    public static List<MonitorInfo> GetMonitors() {
        List<MonitorInfo> monitors = new List<MonitorInfo>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, delegate (IntPtr hMonitor, IntPtr hdcMonitor, ref RECT lprcMonitor, IntPtr dwData) {
            MONITORINFOEX mi = new MONITORINFOEX();
            mi.cbSize = (uint)Marshal.SizeOf(typeof(MONITORINFOEX));
            if (GetMonitorInfo(hMonitor, ref mi)) {
                MonitorInfo info = new MonitorInfo {
                    HMonitor = hMonitor,
                    DeviceName = mi.szDevice,
                    Bounds = mi.rcMonitor,
                    IsPrimary = (mi.dwFlags & 1) != 0
                };
                monitors.Add(info);
            }
            return true;
        }, IntPtr.Zero);
        return monitors;
    }

    public class MonitorInfo {
        public IntPtr HMonitor { get; set; }
        public string DeviceName { get; set; }
        public RECT Bounds { get; set; }
        public bool IsPrimary { get; set; }
    }

    private static string GetFriendlyName(string deviceID, string defaultDesc) {
        if (string.IsNullOrEmpty(deviceID)) return defaultDesc;
        
        string[] parts = deviceID.Split('\\');
        if (parts.Length < 4) return defaultDesc;
        
        string vesaID = parts[1];
        string driverKey = parts[2] + "\\" + parts[3];

        try {
            using (var searcher = new ManagementObjectSearcher(@"root\wmi", "SELECT * FROM WmiMonitorID")) {
                foreach (ManagementObject mo in searcher.Get()) {
                    string instanceName = (string)mo["InstanceName"];
                    
                    string cleanInstance = instanceName;
                    if (cleanInstance.EndsWith("_0")) {
                        cleanInstance = cleanInstance.Substring(0, cleanInstance.Length - 2);
                    }

                    string registryPath = @"SYSTEM\CurrentControlSet\Enum\" + cleanInstance;
                    using (RegistryKey key = Registry.LocalMachine.OpenSubKey(registryPath)) {
                        if (key != null) {
                            string driver = (string)key.GetValue("Driver");
                            if (string.Equals(driver, driverKey, StringComparison.OrdinalIgnoreCase)) {
                                ushort[] nameArray = (ushort[])mo["UserFriendlyName"];
                                string name = Decode(nameArray);
                                if (!string.IsNullOrEmpty(name)) {
                                    return name;
                                }
                            }
                        }
                    }
                }
            }
        } catch {
            // Suppress and fallback
        }

        return defaultDesc;
    }

    private static string Decode(ushort[] array) {
        if (array == null) return "";
        char[] chars = new char[array.Length];
        for (int i = 0; i < array.Length; i++) {
            chars[i] = (char)array[i];
        }
        return new string(chars).TrimEnd('\0').Trim();
    }

    public static void Main(string[] args) {
        if (args.Length == 0) {
            PrintHelp();
            return;
        }

        string cmd = args[0].ToLower();
        if (cmd == "list") {
            var monitors = GetMonitors();
            Console.WriteLine("[");
            for (int i = 0; i < monitors.Count; i++) {
                var mon = monitors[i];
                uint physCount = 0;
                GetNumberOfPhysicalMonitorsFromHMONITOR(mon.HMonitor, ref physCount);
                
                string desc = "Generic PnP Monitor";
                bool ddcSupport = false;

                if (physCount > 0) {
                    var phys = new PHYSICAL_MONITOR[physCount];
                    if (GetPhysicalMonitorsFromHMONITOR(mon.HMonitor, physCount, phys)) {
                        desc = phys[0].szPhysicalMonitorDescription;
                        uint pvct = 0, current = 0, max = 0;
                        ddcSupport = GetVCPFeatureAndVCPFeatureReply(phys[0].hPhysicalMonitor, 0x10, ref pvct, ref current, ref max);
                        DestroyPhysicalMonitors(physCount, phys);
                    }
                }

                // Resolve friendly name via EnumDisplayDevices & WMI
                DISPLAY_DEVICE monitorDevice = new DISPLAY_DEVICE();
                monitorDevice.cb = (uint)Marshal.SizeOf(typeof(DISPLAY_DEVICE));
                if (EnumDisplayDevices(mon.DeviceName, 0, ref monitorDevice, 0)) {
                    desc = GetFriendlyName(monitorDevice.DeviceID, desc);
                }

                Console.Write("  {");
                Console.Write(" \"device\": \"{0}\",", mon.DeviceName.Replace("\\", "\\\\"));
                Console.Write(" \"description\": \"{0}\",", desc.Replace("\"", "\\\""));
                Console.Write(" \"isPrimary\": {0},", mon.IsPrimary ? "true" : "false");
                Console.Write(" \"ddcciSupported\": {0},", ddcSupport ? "true" : "false");
                Console.Write(" \"bounds\": {{ \"left\": {0}, \"top\": {1}, \"right\": {2}, \"bottom\": {3} }}", mon.Bounds.left, mon.Bounds.top, mon.Bounds.right, mon.Bounds.bottom);
                Console.Write(" }");
                if (i < monitors.Count - 1) Console.WriteLine(",");
                else Console.WriteLine();
            }
            Console.WriteLine("]");
        } else if (cmd == "set-power") {
            if (args.Length < 3) {
                Console.WriteLine("Error: Missing arguments for set-power.");
                return;
            }
            string targetDevice = args[1];
            uint powerValue = uint.Parse(args[2]); // 1 = On, 4 = Off

            var monitors = GetMonitors();
            bool found = false;
            foreach (var mon in monitors) {
                if (mon.DeviceName.Equals(targetDevice, StringComparison.OrdinalIgnoreCase)) {
                    found = true;
                    uint physCount = 0;
                    GetNumberOfPhysicalMonitorsFromHMONITOR(mon.HMonitor, ref physCount);
                    if (physCount > 0) {
                        var phys = new PHYSICAL_MONITOR[physCount];
                        if (GetPhysicalMonitorsFromHMONITOR(mon.HMonitor, physCount, phys)) {
                            foreach (var pMon in phys) {
                                bool success = SetVCPFeature(pMon.hPhysicalMonitor, 0xD6, powerValue);
                                Console.WriteLine("{{\"device\": \"{0}\", \"success\": {1}}}", mon.DeviceName.Replace("\\", "\\\\"), success ? "true" : "false");
                            }
                            DestroyPhysicalMonitors(physCount, phys);
                        } else {
                            Console.WriteLine("{{\"device\": \"{0}\", \"error\": \"Failed to get physical monitors\"}}", mon.DeviceName.Replace("\\", "\\\\"));
                        }
                    } else {
                        Console.WriteLine("{{\"device\": \"{0}\", \"error\": \"No physical monitors found\"}}", mon.DeviceName.Replace("\\", "\\\\"));
                    }
                }
            }
            if (!found) {
                Console.WriteLine("{{\"error\": \"Monitor not found: {0}\"}}", targetDevice);
            }
        } else {
            PrintHelp();
        }
    }

    private static void PrintHelp() {
        Console.WriteLine("MonitorController.exe - Command line tool to control monitor power via DDC/CI");
        Console.WriteLine("Commands:");
        Console.WriteLine("  list                     Lists all monitors in JSON format");
        Console.WriteLine("  set-power <device> <1|4> Sets power state: 1 = On, 4 = Off");
    }
}
