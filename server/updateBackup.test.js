const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const { backupForUpdate } = require("./updateBackup");

test("verified snapshot contains WAL data and never overwrites an earlier backup", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "billing-update-test-"));
    const source = new Database(path.join(directory, "database.sqlite"));
    source.pragma("journal_mode = WAL");
    source.exec("CREATE TABLE sample(value INTEGER); INSERT INTO sample VALUES(42)");
    try {
        const first = await backupForUpdate(directory);
        const second = await backupForUpdate(directory);
        assert.notEqual(first, second);
        const copy = new Database(first, { readonly: true });
        try { assert.equal(copy.prepare("SELECT value FROM sample").get().value, 42); }
        finally { copy.close(); }
    } finally { source.close(); }
});

test("missing database blocks backup instead of creating an empty database", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "billing-update-missing-"));
    await assert.rejects(backupForUpdate(directory), /Database not found/);
    assert.equal(fs.existsSync(path.join(directory, "database.sqlite")), false);
});
