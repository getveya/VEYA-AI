/**
 * VEYA-AI Installer — Preload
 * Exposes only the functions the UI actually needs.
 */

const { contextBridge, ipcRenderer } = require("electron");

const listen = channel => cb => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("veya", {
    minimize: () => ipcRenderer.send("win-minimize"),
    close: () => ipcRenderer.send("win-close"),
    openExternal: url => ipcRenderer.send("open-external", url),

    getState: () => ipcRenderer.invoke("get-state"),
    chooseDir: current => ipcRenderer.invoke("choose-dir", current),
    runInstall: opts => ipcRenderer.invoke("run-install", opts),
    runRepair: () => ipcRenderer.invoke("run-repair"),
    runUninstall: opts => ipcRenderer.invoke("run-uninstall", opts),
    launchDiscord: ids => ipcRenderer.invoke("launch-discord", ids),
    openLog: file => ipcRenderer.invoke("open-log", file),
    quit: () => ipcRenderer.invoke("quit-after-uninstall"),

    onProgress: listen("install-progress"),
    onUninstallProgress: listen("uninstall-progress"),
});
