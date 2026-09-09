const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { configureUpdates } = require("./updates");

function setup({ failBackup = false, responses = [0, 0] } = {}) {
    const updater = new EventEmitter();
    const calls = [];
    updater.checkForUpdates = async () => {
        updater.emit("update-available");
        return { updateInfo: { version: "1.0.1" } };
    };
    updater.downloadUpdate = async () => { calls.push("download"); };
    updater.quitAndInstall = () => { calls.push("install"); };
    const control = configureUpdates({
        app: { isPackaged: true }, autoUpdater: updater,
        dialog: { showMessageBox: async () => ({ response: responses.shift() ?? 0 }) },
        getWindow: () => ({ setProgressBar() {} }),
        prepareUpdate: async () => { calls.push("backup"); if (failBackup) throw new Error("Disk full"); },
        recoverBackend: () => calls.push("recover")
    });
    return { updater, calls, control };
}

test("installation requires successful backup and disables install on ordinary quit", async () => {
    const { updater, calls, control } = setup();
    await control.check(true);
    assert.deepEqual(calls, ["download", "backup", "install"]);
    assert.equal(updater.autoInstallOnAppQuit, false);
});
test("backup failure blocks installation and restarts backend", async () => {
    const { calls, control } = setup({ failBackup: true });
    await control.check(true);
    assert.deepEqual(calls, ["download", "backup", "recover"]);
});
test("later defers installation; next check reuses download", async () => {
    const { calls, control } = setup({ responses: [0, 1, 0] });
    await control.check(true);
    assert.deepEqual(calls, ["download"]);
    await control.check(true);
    assert.deepEqual(calls, ["download", "backup", "install"]);
});
