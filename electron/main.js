const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;

const isDev = !app.isPackaged;

function startBackend() {
    const serverPath = isDev
        ? path.join(__dirname, "..", "server", "server.js")
        : path.join(process.resourcesPath, "server", "server.js");

    console.log("Starting backend:", serverPath);

    serverProcess = spawn(
        process.execPath,
        [serverPath],
        {
            env: {
                ...process.env,

                ELECTRON_RUN_AS_NODE: "1",

                BILLING_DATA_DIR: isDev
                    ? path.join(__dirname, "..", "server")
                    : path.join(
                        app.getPath("userData"),
                        "data"
                    ),

                CLIENT_DIST_PATH: isDev
                    ? path.join(
                        __dirname,
                        "..",
                        "client",
                        "dist"
                    )
                    : path.join(
                        process.resourcesPath,
                        "app",
                        "client",
                        "dist"
                    )
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
        // Development
        mainWindow.loadURL("http://localhost:5173");
    } else {
        // Production
        mainWindow.loadURL("http://localhost:5000");
    }
}

app.whenReady().then(() => {
    startBackend();

    // Give the backend a moment to start
    setTimeout(() => {
        createWindow();
    }, 2000);
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
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
});