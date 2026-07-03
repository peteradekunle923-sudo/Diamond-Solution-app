/**
 * Unique Device ID management for Diamond Academy.
 * Stores a unique, persistent device ID in localStorage to identify the specific device/browser.
 */
export function getOrGenerateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let devId = localStorage.getItem("diamond_device_id");
  if (!devId) {
    devId = "device_" + Math.random().toString(36).substring(2, 15) + "_" + Date.now().toString(36);
    localStorage.setItem("diamond_device_id", devId);
  }
  return devId;
}
