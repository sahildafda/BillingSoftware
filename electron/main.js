const { app, BrowserWindow, dialog, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const { configureUpdates } = require("./updates");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;
let updates;
let updateTimer;

const isDev = !app.isPackaged;
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on("second-instance", () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});
const dataDirectory = () => isDev ? path.join(__dirname, "..", "server") : path.join(app.getPath("userData"), "data");

async function prepareUpdate() {
    const backend = serverProcess;
    if (!backend || backend.exitCode !== null) throw new Error("Backend is unavailable. Restart the application before updating.");
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Backend did not stop; update cancelled.")), 15000);
        backend.once("exit", () => { clearTimeout(timer); resolve(); });
        if (!backend.kill()) { clearTimeout(timer); reject(new Error("Could not stop backend.")); }
    });
    serverProcess = null;
    await new Promise((resolve, reject) => {
        const helper = spawn(process.execPath, [path.join(process.resourcesPath, "server", "updateBackup.js")], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", BILLING_DATA_DIR: dataDirectory() },
            windowsHide: true, stdio: "pipe"
        });
        let errorText = "";
        helper.stdout.on("data", (data) => console.log(`[Update backup] ${data}`));
        helper.stderr.on("data", (data) => { errorText += data.toString(); });
        helper.once("error", reject);
        helper.once("exit", (code) => code === 0 ? resolve() : reject(new Error(errorText || "Database backup failed.")));
    });
}

function recoverBackend() {
    if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) startBackend();
}

function startBackend() {
    const serverPath = isDev
        ? path.join(__dirname, "..", "server", "server.js")
        : path.join(process.resourcesPath, "server", "server.js");

    const clientDistPath = isDev
        ? path.join(__dirname, "..", "client", "dist")
        : path.join(app.getAppPath(), "client", "dist");

    const dataDir = isDev
        ? path.join(__dirname, "..", "server")
        : path.join(app.getPath("userData"), "data");

    console.log("=================================");
    console.log("Starting Billing Software");
    console.log("Packaged:", app.isPackaged);
    console.log("Server:", serverPath);
    console.log("Client:", clientDistPath);
    console.log("Data:", dataDir);
    console.log("=================================");

    serverProcess = spawn(
        process.execPath,
        [serverPath],
        {
            env: {
                ...process.env,

                ELECTRON_RUN_AS_NODE: "1",

                BILLING_DATA_DIR: dataDir,

                CLIENT_DIST_PATH: clientDistPath
            },

            stdio: "pipe",
            windowsHide: true
        }
    );

    serverProcess.stdout.on("data", (data) => {
        console.log(`[SERVER] ${data}`);
    });

    serverProcess.stderr.on("data", (data) => {
        console.error(`[SERVER ERROR] ${data}`);
    });

    serverProcess.on("error", (error) => {
        console.error("Failed to start backend:", error);
    });

    serverProcess.on("exit", (code) => {
        console.log(`Backend stopped with code ${code}`);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,

        autoHideMenuBar: true,

        webPreferences: {
            preload: path.join(__dirname, "preload.js"),

            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.setMenuBarVisibility(false);

    if (isDev) {
        mainWindow.loadURL("http://localhost:5173");
    } else {
        mainWindow.loadURL("http://localhost:5000");
    }

    mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
        console.error(
            "Electron failed to load:",
            errorCode,
            errorDescription
        );
    });
}

app.whenReady().then(() => {
    if (!hasInstanceLock) return;
    startBackend();

    // Give Express time to start
    setTimeout(() => {
        createWindow();
        updates = configureUpdates({ app, autoUpdater, dialog, getWindow: () => mainWindow,
            prepareUpdate, recoverBackend });
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            { label: "Help", submenu: [{ label: "Check for updates", accelerator: "Ctrl+Shift+U", click: () => updates.check(true) }] }
        ]));
        void updates.check();
        updateTimer = setInterval(() => updates.check(), 4 * 60 * 60 * 1000);
    }, 2500);
});

app.on("window-all-closed", () => {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }

    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", () => {
    clearInterval(updateTimer);
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
});
