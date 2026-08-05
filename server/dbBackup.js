const fs = require("fs");
const path = require("path");

function resolveBackupHour(rawHour = process.env.DB_BACKUP_HOUR || "6") {
    const value = String(rawHour ?? "").trim();

    if (!value) {
        return 6;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 23) {
        return 6;
    }

    return Math.floor(parsed);
}

function buildBackupFilename(baseName = "database", date = new Date()) {
    const safeDate = date instanceof Date ? date : new Date(date);
    const pad = (value) => String(value).padStart(2, "0");

    const year = safeDate.getFullYear();
    const month = pad(safeDate.getMonth() + 1);
    const day = pad(safeDate.getDate());
    const hour = pad(safeDate.getHours());
    const minute = pad(safeDate.getMinutes());
    const second = pad(safeDate.getSeconds());

    return `${baseName}_${year}-${month}-${day}_${hour}-${minute}-${second}.sqlite`;
}

function getNextBackupDelay(now = new Date(), backupHour = resolveBackupHour(process.env.DB_BACKUP_HOUR), backupMinute = 0) {
    const current = new Date(now);
    const nextScheduled = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
        backupHour,
        backupMinute,
        0,
        0
    );

    if (nextScheduled <= current) {
        nextScheduled.setDate(nextScheduled.getDate() + 1);
    }

    return nextScheduled.getTime() - current.getTime();
}

async function createDatabaseBackup({ dbInstance, backupDirectory = path.join(__dirname, "backups"), baseName = "database" } = {}) {
    if (!dbInstance || typeof dbInstance.backup !== "function") {
        throw new Error("A valid SQLite database instance is required for backup creation");
    }

    fs.mkdirSync(backupDirectory, { recursive: true });

    const fileName = buildBackupFilename(baseName, new Date());
    const backupPath = path.join(backupDirectory, fileName);

    await dbInstance.backup(backupPath);

    return {
        backupPath,
        fileName,
        createdAt: new Date().toISOString(),
    };
}

function initializeBackupScheduler({ dbInstance, backupDirectory = path.join(__dirname, "backups"), baseName = "database", backupHour = resolveBackupHour(process.env.DB_BACKUP_HOUR) } = {}) {
    if (!dbInstance || typeof dbInstance.backup !== "function") {
        throw new Error("A valid SQLite database instance is required for scheduler setup");
    }

    let activeDb = dbInstance;
    let timeoutId = null;

    const runScheduledBackup = async () => {
        try {
            const result = await createDatabaseBackup({ dbInstance: activeDb, backupDirectory, baseName });
            console.log(`[DB Backup] Backup created at ${result.fileName}`);
        } catch (error) {
            console.error("[DB Backup] Automatic backup failed:", error.message);
        }
    };

    const scheduleNext = () => {
        const delay = getNextBackupDelay(new Date(), backupHour, 0);
        console.log(`[DB Backup] Next automatic backup scheduled in ${Math.round(delay / 60000)} minutes at ${backupHour}:00`);

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(async () => {
            await runScheduledBackup();
            scheduleNext();
        }, delay);
    };

    const setDatabase = (nextDb) => {
        if (nextDb && typeof nextDb.backup === "function") {
            activeDb = nextDb;
            console.log("[DB Backup] Database reference refreshed for scheduled backup.");
        }
    };

    scheduleNext();

    return {
        runScheduledBackup,
        scheduleNext,
        backupHour,
        setDatabase,
        stop: () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        },
    };
}

module.exports = {
    resolveBackupHour,
    buildBackupFilename,
    getNextBackupDelay,
    createDatabaseBackup,
    initializeBackupScheduler,
};
