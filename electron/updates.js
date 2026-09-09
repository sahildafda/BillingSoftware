function configureUpdates({ app, autoUpdater, dialog, getWindow, prepareUpdate, recoverBackend }) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoInstallEvent = "manual";
    let busy = false;
    let installing = false;
    let downloaded = false;
    let available = false;
    autoUpdater.on("update-available", () => { available = true; });
    autoUpdater.on("update-not-available", () => { available = false; });
    const show = (options) => dialog.showMessageBox(getWindow(), options);
    const report = (error) => show({ type: "error", title: "Update could not complete",
        message: "The update was not installed.", detail: error.message });

    async function install() {
        const { response } = await show({ type: "info", title: "Update ready",
            message: "The update is ready to install.",
            detail: "Save your work first. We will back up and verify your database, then restart Billing Software. If backup fails, installation will be cancelled.",
            buttons: ["Back up and restart", "Later"], defaultId: 1, cancelId: 1 });
        if (response !== 0) return;
        installing = true;
        try {
            await prepareUpdate();
            autoUpdater.quitAndInstall(false, true);
        } catch (error) {
            installing = false;
            recoverBackend();
            await report(error);
        }
    }

    autoUpdater.on("error", (error) => {
        console.error("[Updater]", error);
        if (installing) {
            installing = false;
            recoverBackend();
            void report(error);
        }
    });
    autoUpdater.on("download-progress", ({ percent }) => getWindow()?.setProgressBar(percent / 100));

    async function check(manual = false) {
        if (busy || installing) return;
        if (!app.isPackaged) {
            if (manual) await show({ message: "Updates are available in the installed Windows application." });
            return;
        }
        busy = true;
        let downloadRequested = false;
        try {
            if (downloaded) return await install();
            const result = await autoUpdater.checkForUpdates();
            if (!result || !available) {
                if (manual) await show({ message: "You are using the latest version." });
                return;
            }
            const { response } = await show({ type: "info", title: "New update available",
                message: `Billing Software ${result.updateInfo.version} is available.`,
                detail: "Download now, then choose when to back up your database and restart.",
                buttons: ["Download update", "Later"], defaultId: 0, cancelId: 1 });
            if (response !== 0) return;
            downloadRequested = true;
            await autoUpdater.downloadUpdate();
            downloaded = true;
            await install();
        } catch (error) {
            if (manual || downloaded || downloadRequested) await report(error);
            else console.error("[Updater] Check/download failed:", error);
        } finally {
            getWindow()?.setProgressBar(-1);
            busy = false;
        }
    }
    return { check, isInstalling: () => installing };
}

module.exports = { configureUpdates };
