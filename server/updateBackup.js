const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

// Runs only after the application backend has exited, so no writes can be lost
// between the snapshot and installation. SQLite also recovers any pending WAL.
async function backupForUpdate(dataDir) {
    const sourcePath = path.join(dataDir, "database.sqlite");
    if (!fs.existsSync(sourcePath)) throw new Error("Database not found; update cancelled.");
    const directory = path.join(dataDir, "backups");
    fs.mkdirSync(directory, { recursive: true });
    const destination = path.join(directory,
        `database_pre-update_${new Date().toISOString().replace(/[:.]/g, "-")}_${crypto.randomUUID()}.sqlite`);
    const source = new Database(sourcePath, { fileMustExist: true });
    try {
        await source.backup(destination);
        const copy = new Database(destination, { readonly: true, fileMustExist: true });
        try {
            const result = copy.pragma("integrity_check");
            if (result.length !== 1 || result[0].integrity_check !== "ok") {
                throw new Error("Database backup failed integrity verification.");
            }
        } finally {
            copy.close();
        }
        return destination;
    } finally {
        source.close();
    }
}

if (require.main === module) {
    backupForUpdate(process.env.BILLING_DATA_DIR).then((file) => {
        console.log(file);
    }).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { backupForUpdate };
