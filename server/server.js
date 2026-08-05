const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const bwipjs = require("bwip-js");
const multer = require("multer");
const Database = require("better-sqlite3");
const { createDatabaseBackup, initializeBackupScheduler, resolveBackupHour } = require("./dbBackup");

const app = express();
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || "billing-software-secret";
const DB_BACKUP_HOUR = resolveBackupHour(process.env.DB_BACKUP_HOUR || "6");
const DB_FILE_PATH = path.join(__dirname, "database.sqlite");
const backupUpload = multer({ dest: path.join(__dirname, "tmp-uploads"), limits: { fileSize: 100 * 1024 * 1024 } });
let db = new Database(DB_FILE_PATH);
let backupScheduler = initializeBackupScheduler({
    dbInstance: db,
    backupDirectory: path.join(__dirname, "backups"),
    baseName: "database",
    backupHour: DB_BACKUP_HOUR,
});

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use("/api/db/backups", express.static(path.join(__dirname, "backups")));

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        companyName TEXT NOT NULL,
        gstNo TEXT NOT NULL,
        ownerName TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        shopAddress TEXT NOT NULL,
        password TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS pending_registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        otp TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        payload TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        productName TEXT NOT NULL,
        productPrice REAL NOT NULL DEFAULT 0,
        sellingPrice REAL NOT NULL DEFAULT 0,
        stock INTEGER NOT NULL DEFAULT 0,
        brand TEXT DEFAULT '',
        supplierId INTEGER,
        gstPercentage REAL NOT NULL DEFAULT 0,
        productImages TEXT NOT NULL DEFAULT '[]',
        discount REAL NOT NULL DEFAULT 0,
        barcode TEXT,
        stockStatus TEXT NOT NULL DEFAULT 'out_of_stock',
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(supplierId) REFERENCES suppliers(id)
    )
`);

function ensureProductSupplierColumn() {
    const columns = db.prepare("PRAGMA table_info(products)").all();
    const hasSupplierId = columns.some((column) => column.name === "supplierId");

    if (!hasSupplierId) {
        db.exec("ALTER TABLE products ADD COLUMN supplierId INTEGER");
    }
}

ensureProductSupplierColumn();

db.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        customerId INTEGER,
        customerName TEXT NOT NULL,
        contactNumber TEXT,
        email TEXT,
        invoiceNumber TEXT NOT NULL UNIQUE,
        subtotal REAL NOT NULL DEFAULT 0,
        gstTotal REAL NOT NULL DEFAULT 0,
        discountTotal REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'paid',
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(customerId) REFERENCES customers(id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        invoiceId INTEGER NOT NULL,
        productId INTEGER,
        productName TEXT NOT NULL,
        sku TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        unitPrice REAL NOT NULL DEFAULT 0,
        gstPercent REAL NOT NULL DEFAULT 0,
        discountPercent REAL NOT NULL DEFAULT 0,
        lineTotal REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(invoiceId) REFERENCES invoices(id),
        FOREIGN KEY(productId) REFERENCES products(id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        invoiceId INTEGER NOT NULL,
        method TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(invoiceId) REFERENCES invoices(id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        customerName TEXT NOT NULL,
        contactNumber TEXT NOT NULL,
        email TEXT NOT NULL,
        credit REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        supplierName TEXT NOT NULL,
        companyName TEXT NOT NULL,
        contactNumber TEXT NOT NULL,
        email TEXT NOT NULL,
        address TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
    )
`);

function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            companyName: user.companyName,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ message: "Authentication token is required" });
    }

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

function generateOtp() {
    return crypto.randomInt(100000, 999999).toString();
}

function parseNumericValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function serializeProductImages(value) {
    if (Array.isArray(value)) {
        return JSON.stringify(value.filter(Boolean));
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return JSON.stringify([]);
        }

        if (trimmed.includes(",")) {
            return JSON.stringify(trimmed.split(",").map((item) => item.trim()).filter(Boolean));
        }

        return JSON.stringify([trimmed]);
    }

    return JSON.stringify([]);
}

function normalizeProductImages(value) {
    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value.filter(Boolean);
    }

    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [parsed].filter(Boolean);
        } catch (error) {
            return value.split(",").map((item) => item.trim()).filter(Boolean);
        }
    }

    return [String(value)];
}

function getStockStatus(stock) {
    return Number(stock) > 0 ? "in_stock" : "out_of_stock";
}

function generateBarcode() {
    return `PRD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function generateInvoiceNumber() {
    return `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function normalizeWhatsAppNumber(value) {
    if (!value) {
        return null;
    }

    const candidate = String(value).trim();
    if (!candidate) {
        return null;
    }

    const cleaned = candidate.replace(/[^\d+]/g, "");
    if (!cleaned) {
        return null;
    }

    const normalized = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
    return `whatsapp:${normalized}`;
}

function formatCurrency(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

async function sendInvoiceWhatsApp(invoice, customer, user) {
    const enabled = String(process.env.TWILIO_WHATSAPP_ENABLE || "false").toLowerCase() === "true";
    if (!enabled) {
        console.log("[WhatsApp] Twilio WhatsApp delivery is disabled; set TWILIO_WHATSAPP_ENABLE=true to enable it.");
        return { success: false, skipped: true, reason: "TWILIO_WHATSAPP_ENABLE is not enabled" };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    const authToken = process.env.TWILIO_AUTH_TOKEN || "";
    const from = process.env.TWILIO_WHATSAPP_FROM || "";
    const to = normalizeWhatsAppNumber(customer?.contactNumber || customer?.phone || customer?.mobile || invoice?.contactNumber || invoice?.phone || "");

    if (!accountSid || !authToken || !from || !to) {
        console.log("[WhatsApp] Twilio environment variables are missing or the customer contact is incomplete.");
        return {
            success: false,
            skipped: true,
            reason: "Missing Twilio or WhatsApp contact configuration",
        };
    }

    const customerName = String(customer?.customerName || "Customer").trim() || "Customer";
    const businessName = String(user?.companyName || "Billing Software").trim() || "Billing Software";
    const message = `Hello ${customerName}, your invoice ${invoice?.invoiceNumber || "N/A"} for ${formatCurrency(invoice?.total || 0)} has been generated by ${businessName}. Thank you for your purchase.`;

    try {
        const client = twilio(accountSid, authToken);
        const result = await client.messages.create({
            from,
            to,
            body: message,
        });

        console.log("[WhatsApp] Invoice message sent successfully:", result.sid);
        return { success: true, sid: result.sid, to, message };
    } catch (error) {
        console.error("[WhatsApp] Invoice message delivery failed:", error.message);
        return {
            success: false,
            error: error.message,
            reason: "Twilio message delivery failed",
        };
    }
}

function getBarcodeEncryptionKey() {
    const keySource = process.env.BARCODE_ENCRYPTION_KEY || JWT_SECRET;
    return crypto.createHash("sha256").update(String(keySource)).digest();
}

function encryptBarcodeValue(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getBarcodeEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

function createBarcodeSvg(rawValue, details = {}, options = {}) {
    const config = {
        bcid: "code128",
        text: String(rawValue || "").trim(),
        scale: 2,
        height: Number(options.height || 70),
        width: Number(options.width || 2),
        includetext: false,
        textxalign: "center",
        paddingwidth: 6,
        paddingheight: 8,
        backgroundcolor: "ffffff",
        foregroundcolor: "000000",
        rotate: "N",
    };

    const productName = String(details.productName || "").trim();
    const sellingPrice = Number(details.sellingPrice || 0).toFixed(2);
    const discount = Number(details.discount || 0);
    const discountedLine = discount > 0 ? `Discount: ${discount}%` : "";
    const productLine = productName || "Product";
    const priceLine = `₹${sellingPrice}`;

    const svg = bwipjs.toSVG(config);
    const lines = `
      <text x="50%" y="18" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="bold" fill="#000">${productLine}</text>
      <text x="50%" y="34" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#000">${priceLine}</text>
      ${discountedLine ? `<text x="50%" y="50" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#000">${discountedLine}</text>` : ""}`;
    const svgWithText = svg.replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg"`);
    const insertIndex = svgWithText.indexOf("<g");
    const trimmedSvg = insertIndex >= 0 ? svgWithText.slice(0, insertIndex) + lines + svgWithText.slice(insertIndex) : svgWithText;

    return trimmedSvg;
}

function formatProduct(product) {
    if (!product) {
        return null;
    }

    return {
        id: product.id,
        userId: product.userId,
        productName: product.productName,
        productPrice: Number(product.productPrice || 0),
        sellingPrice: Number(product.sellingPrice || 0),
        stock: Number(product.stock || 0),
        brand: product.brand,
        supplierId: product.supplierId != null ? Number(product.supplierId) : null,
        gstPercentage: Number(product.gstPercentage || 0),
        productImages: normalizeProductImages(product.productImages),
        discount: Number(product.discount || 0),
        barcode: product.barcode,
        stockStatus: product.stockStatus || getStockStatus(product.stock),
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
    };
}

async function sendOtpEmail(email, otp) {
    const message = `Your Billing Software OTP is: ${otp}. It expires in 10 minutes.`;

    console.log("[OTP] Preparing email delivery for:", email);
    console.log("[OTP] SMTP config:", {
        host: process.env.EMAIL_HOST || "smtp.gmail.com",
        port: Number(process.env.EMAIL_PORT || 587),
        userConfigured: Boolean(process.env.EMAIL_USER),
    });

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log("[OTP] SMTP credentials are missing. Falling back to console log.");
        console.log(`[OTP] To: ${email}\n${message}`);
        console.log("[OTP] Set EMAIL_USER and EMAIL_PASS in the .env file to send real email.");
        return { success: true, message, fallback: true };
    }

    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || "smtp.gmail.com",
        port: Number(process.env.EMAIL_PORT || 587),
        secure: Number(process.env.EMAIL_PORT || 587) === 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        logger: true,
        debug: true,
    });

    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: email,
            subject: "Billing Software Email Verification",
            text: message,
        });

        console.log("[OTP] Mail sent successfully", info.messageId);
        return { success: true, message };
    } catch (error) {
        console.error("[OTP] Mail sending failed", error);
        return { success: false, message, error: error.message };
    }
}

function ensureDatabaseBackupDirectory() {
    const backupDir = path.join(__dirname, "backups");
    require("fs").mkdirSync(backupDir, { recursive: true });
    return backupDir;
}

async function performDatabaseBackup() {
    const backupDirectory = ensureDatabaseBackupDirectory();
    const result = await createDatabaseBackup({ dbInstance: db, backupDirectory, baseName: "database" });
    return result;
}

async function restoreDatabaseFromFile(filePath) {
    const targetPath = DB_FILE_PATH;
    const sourceDb = new Database(filePath, { readonly: true });

    try {
        const tables = sourceDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
        if (!tables.length) {
            throw new Error("Selected file does not contain a valid SQLite database");
        }
    } finally {
        sourceDb.close();
    }

    if (db && typeof db.close === "function") {
        db.close();
    }

    require("fs").copyFileSync(filePath, targetPath);
    db = new Database(targetPath);
    backupScheduler.setDatabase(db);
    console.log("[DB Restore] Database replaced from backup file");
}

app.get("/", (req, res) => {
    res.send("Backend Running");
});

app.post("/api/db/backup", authenticateToken, async (req, res) => {
    try {
        const backup = await performDatabaseBackup();
        return res.json({ message: "Database backup created successfully", backup });
    } catch (error) {
        console.error("[DB Backup] Manual backup failed:", error.message);
        return res.status(500).json({ message: "Database backup failed", error: error.message });
    }
});

app.get("/api/db/backup-list", authenticateToken, (req, res) => {
    const backupDir = path.join(__dirname, "backups");

    try {
        require("fs").mkdirSync(backupDir, { recursive: true });
        const files = require("fs").readdirSync(backupDir)
            .filter((filename) => filename.endsWith(".sqlite"))
            .sort((a, b) => b.localeCompare(a));

        return res.json({ message: "Backup list fetched successfully", files });
    } catch (error) {
        return res.status(500).json({ message: "Unable to list backups", error: error.message });
    }
});

app.get("/api/db/download/:fileName", authenticateToken, (req, res) => {
    const fileName = path.basename(req.params.fileName);
    const backupPath = path.join(__dirname, "backups", fileName);

    if (!require("fs").existsSync(backupPath)) {
        return res.status(404).json({ message: "Backup file not found" });
    }

    return res.download(backupPath, fileName);
});

app.post("/api/db/import", authenticateToken, backupUpload.single("databaseFile"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "Please upload a SQLite database file" });
    }

    const allowedExtensions = [".sqlite", ".db", ".sqlite3"];
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({ message: "Only SQLite database files are allowed" });
    }

    try {
        const sourcePath = req.file.path;
        await restoreDatabaseFromFile(sourcePath);

        try {
            require("fs").unlinkSync(sourcePath);
        } catch (error) {
            console.warn("[DB Restore] Upload cleanup warning:", error.message);
        }

        const backup = await performDatabaseBackup();
        return res.json({ message: "Database imported successfully", importedFile: req.file.originalname, backup });
    } catch (error) {
        console.error("[DB Restore] Import failed:", error.message);
        return res.status(500).json({ message: "Database import failed", error: error.message });
    }
});

app.post("/api/auth/logout", authenticateToken, async (req, res) => {
    try {
        const backup = await performDatabaseBackup();
        return res.json({ message: "Logout successful and database backup created", backup });
    } catch (error) {
        console.error("[DB Backup] Logout backup failed:", error.message);
        return res.status(500).json({ message: "Logout backup failed", error: error.message });
    }
});

app.post("/api/auth/register", async (req, res) => {
    const { companyName, gstNo, ownerName, email, shopAddress, password, confirmPassword } = req.body;

    if (!companyName || !gstNo || !ownerName || !email || !shopAddress || !password || !confirmPassword) {
        return res.status(400).json({ message: "Please provide all required fields" });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);

    if (existingUser) {
        return res.status(409).json({ message: "A user with this email already exists" });
    }

    console.log("[OTP] Register route hit for:", normalizedEmail);
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const payload = JSON.stringify({
        companyName: String(companyName).trim(),
        gstNo: String(gstNo).trim(),
        ownerName: String(ownerName).trim(),
        email: normalizedEmail,
        shopAddress: String(shopAddress).trim(),
        password: bcrypt.hashSync(password, 10),
    });

    db.prepare("DELETE FROM pending_registrations WHERE email = ?").run(normalizedEmail);
    db.prepare(`
        INSERT INTO pending_registrations (email, otp, expiresAt, payload)
        VALUES (?, ?, ?, ?)
    `).run(normalizedEmail, otp, expiresAt, payload);

    const mailResult = await sendOtpEmail(normalizedEmail, otp);
    console.log("[OTP] Mail result", mailResult);

    return res.status(200).json({
        message: "OTP sent to your email. Please verify it to complete registration.",
        email: normalizedEmail,
        otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    });
});

app.post("/api/auth/verify-otp", (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const pending = db.prepare("SELECT * FROM pending_registrations WHERE email = ?").get(normalizedEmail);

    if (!pending) {
        return res.status(404).json({ message: "No pending registration found for this email" });
    }

    if (new Date(pending.expiresAt).getTime() < Date.now()) {
        db.prepare("DELETE FROM pending_registrations WHERE email = ?").run(normalizedEmail);
        return res.status(410).json({ message: "OTP expired. Please register again" });
    }

    if (pending.otp !== String(otp).trim()) {
        return res.status(401).json({ message: "Invalid OTP" });
    }

    const payload = JSON.parse(pending.payload);
    const insertUser = db.prepare(`
        INSERT INTO users (companyName, gstNo, ownerName, email, shopAddress, password)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insertUser.run(
        payload.companyName,
        payload.gstNo,
        payload.ownerName,
        payload.email,
        payload.shopAddress,
        payload.password
    );

    const user = db.prepare(`
        SELECT id, companyName, gstNo, ownerName, email, shopAddress, createdAt
        FROM users
        WHERE id = ?
    `).get(result.lastInsertRowid);

    db.prepare("DELETE FROM pending_registrations WHERE email = ?").run(normalizedEmail);

    const token = createToken(user);

    return res.status(201).json({ message: "Registration completed successfully", user, token });
});

app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);

    if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);

    if (!isPasswordValid) {
        return res.status(401).json({ message: "Invalid email or password" });
    }

    const safeUser = {
        id: user.id,
        companyName: user.companyName,
        gstNo: user.gstNo,
        ownerName: user.ownerName,
        email: user.email,
        shopAddress: user.shopAddress,
        createdAt: user.createdAt,
    };

    const token = createToken(safeUser);

    return res.json({ message: "Login successful", user: safeUser, token });
});

app.post("/api/auth/forgot-password", async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);

    if (!user) {
        return res.status(404).json({ message: "No account found with this email" });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    db.prepare("DELETE FROM pending_registrations WHERE email = ?").run(normalizedEmail);
    db.prepare(`
        INSERT INTO pending_registrations (email, otp, expiresAt, payload)
        VALUES (?, ?, ?, ?)
    `).run(normalizedEmail, otp, expiresAt, JSON.stringify({ type: "forgot-password" }));

    const mailResult = await sendOtpEmail(normalizedEmail, otp);
    console.log("[OTP] Forgot password mail result", mailResult);

    return res.json({
        message: "OTP sent to your email. Please verify it to change your password.",
        email: normalizedEmail,
        otp: process.env.NODE_ENV !== "production" ? otp : undefined,
    });
});

app.post("/api/auth/verify-forgot-password", (req, res) => {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
    }

    if (!newPassword || !confirmPassword) {
        return res.status(400).json({ message: "New password and confirmation are required" });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const pending = db.prepare("SELECT * FROM pending_registrations WHERE email = ?").get(normalizedEmail);

    if (!pending) {
        return res.status(404).json({ message: "No pending forgot-password request found" });
    }

    if (new Date(pending.expiresAt).getTime() < Date.now()) {
        db.prepare("DELETE FROM pending_registrations WHERE email = ?").run(normalizedEmail);
        return res.status(410).json({ message: "OTP expired. Please request again" });
    }

    if (pending.otp !== String(otp).trim()) {
        return res.status(401).json({ message: "Invalid OTP" });
    }

    const payload = JSON.parse(pending.payload);
    if (payload.type !== "forgot-password") {
        return res.status(400).json({ message: "This OTP is not for password reset" });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password = ? WHERE email = ?").run(hashedPassword, normalizedEmail);
    db.prepare("DELETE FROM pending_registrations WHERE email = ?").run(normalizedEmail);

    return res.json({ message: "Password changed successfully" });
});

app.post("/api/auth/change-password", authenticateToken, (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ message: "Current password, new password, and confirmation are required" });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: "Passwords do not match" });
    }

    const user = db.prepare("SELECT id, password FROM users WHERE id = ?").get(req.user.id);

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    const isCurrentPasswordValid = bcrypt.compareSync(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedPassword, req.user.id);

    return res.json({ message: "Password changed successfully" });
});

app.get("/api/products/stock-summary", authenticateToken, (req, res) => {
    const summary = db.prepare(`
        SELECT stockStatus, COUNT(*) AS count
        FROM products
        WHERE userId = ?
        GROUP BY stockStatus
    `).all(req.user.id);

    const result = {
        in_stock: 0,
        out_of_stock: 0,
    };

    summary.forEach((item) => {
        if (item.stockStatus === "in_stock") {
            result.in_stock = Number(item.count || 0);
        } else if (item.stockStatus === "out_of_stock") {
            result.out_of_stock = Number(item.count || 0);
        }
    });

    return res.json({ message: "Stock summary fetched successfully", summary: result });
});

app.get("/api/products", authenticateToken, (req, res) => {
    const { status, search, brand, page = "1", limit = "20", sortBy = "createdAt", sortOrder = "desc" } = req.query;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    let query = "SELECT * FROM products WHERE userId = ?";
    const params = [req.user.id];

    if (status && status !== "all") {
        query += " AND stockStatus = ?";
        params.push(status === "in_stock" ? "in_stock" : "out_of_stock");
    }

    if (search) {
        const value = `%${String(search).trim()}%`;
        query += " AND (productName LIKE ? OR brand LIKE ?)";
        params.push(value, value);
    }

    if (brand) {
        query += " AND brand = ?";
        params.push(String(brand).trim());
    }

    query += " ORDER BY createdAt DESC";

    const rows = db.prepare(query).all(...params);
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sortedRows = [...rows].sort((a, b) => {
        const left = a[sortBy] ?? "";
        const right = b[sortBy] ?? "";

        if (left < right) {
            return -1 * sortDirection;
        }

        if (left > right) {
            return 1 * sortDirection;
        }

        return 0;
    });

    const start = (safePage - 1) * safeLimit;
    const paginatedRows = sortedRows.slice(start, start + safeLimit);

    return res.json({
        message: "Products fetched successfully",
        products: paginatedRows.map(formatProduct),
        pagination: {
            total: sortedRows.length,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.max(1, Math.ceil(sortedRows.length / safeLimit)),
        },
    });
});

app.get("/api/products/:id", authenticateToken, (req, res) => {
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!product) {
        return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ message: "Product fetched successfully", product: formatProduct(product) });
});

app.get("/api/billing/customer-balances", authenticateToken, (req, res) => {
    const { search } = req.query;

    const customers = db.prepare(`
        SELECT *
        FROM customers
        WHERE userId = ?
        ${search ? "AND (customerName LIKE ? OR email LIKE ? OR contactNumber LIKE ?)" : ""}
        ORDER BY customerName ASC
    `).all(
        ...(search
            ? [req.user.id, `%${String(search).trim()}%`, `%${String(search).trim()}%`, `%${String(search).trim()}%`]
            : [req.user.id])
    );

    const balances = customers.map((customer) => {
        const totalInvoiced = db.prepare(`
            SELECT COALESCE(SUM(total), 0) AS totalInvoiced
            FROM invoices
            WHERE userId = ? AND customerId = ?
        `).get(req.user.id, customer.id)?.totalInvoiced || 0;

        const totalPaid = db.prepare(`
            SELECT COALESCE(SUM(ip.amount), 0) AS totalPaid
            FROM invoice_payments ip
            INNER JOIN invoices i ON i.id = ip.invoiceId
            WHERE ip.userId = ? AND i.customerId = ?
        `).get(req.user.id, customer.id)?.totalPaid || 0;

        const balance = Number(totalInvoiced) - Number(totalPaid);

        return {
            id: customer.id,
            customerName: customer.customerName,
            contactNumber: customer.contactNumber,
            email: customer.email,
            totalInvoiced: Number(totalInvoiced),
            totalPaid: Number(totalPaid),
            balance,
            status: balance > 0 ? "due" : balance < 0 ? "advance" : "settled",
        };
    });

    return res.json({
        message: "Customer balances fetched successfully",
        balances,
    });
});

app.get("/api/billing/invoices", authenticateToken, (req, res) => {
    const { status } = req.query;

    let query = "SELECT * FROM invoices WHERE userId = ?";
    const params = [req.user.id];

    if (status) {
        query += " AND status = ?";
        params.push(String(status).trim());
    }

    query += " ORDER BY createdAt DESC";

    const invoices = db.prepare(query).all(...params);
    const items = db.prepare("SELECT * FROM invoice_items WHERE userId = ?").all(req.user.id);
    const payments = db.prepare("SELECT * FROM invoice_payments WHERE userId = ?").all(req.user.id);

    const itemMap = {};
    items.forEach((item) => {
        itemMap[item.invoiceId] = itemMap[item.invoiceId] || [];
        itemMap[item.invoiceId].push(item);
    });

    const paymentsMap = {};
    payments.forEach((payment) => {
        paymentsMap[payment.invoiceId] = paymentsMap[payment.invoiceId] || [];
        paymentsMap[payment.invoiceId].push(payment);
    });

    return res.json({
        message: "Invoices fetched successfully",
        invoices: invoices.map((invoice) => ({
            ...invoice,
            items: itemMap[invoice.id] || [],
            payments: paymentsMap[invoice.id] || [],
        })),
    });
});

app.get("/api/billing/invoices/:id", authenticateToken, (req, res) => {
    const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
    }

    const items = db.prepare("SELECT * FROM invoice_items WHERE invoiceId = ? AND userId = ?").all(req.params.id, req.user.id);
    const payments = db.prepare("SELECT * FROM invoice_payments WHERE invoiceId = ? AND userId = ?").all(req.params.id, req.user.id);

    return res.json({
        message: "Invoice fetched successfully",
        invoice: {
            ...invoice,
            items,
            payments,
        },
    });
});

app.post("/api/billing/invoices", authenticateToken, async (req, res) => {
    const { customer, customerId, items, payments } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "At least one item is required for billing" });
    }

    if (!Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({ message: "At least one payment method is required" });
    }

    const normalizedCustomerName = String((customer && customer.customerName) || "Walk-in Customer").trim() || "Walk-in Customer";
    const normalizedContactNumber = customer && customer.contactNumber ? String(customer.contactNumber).trim() : "";
    const normalizedEmail = customer && customer.email ? String(customer.email).trim() : "";
    const resolvedCustomerId = customerId ? Number(customerId) : null;

    if (resolvedCustomerId !== null && (!Number.isInteger(resolvedCustomerId) || resolvedCustomerId < 1)) {
        return res.status(400).json({ message: "customerId must be valid when provided" });
    }

    if (resolvedCustomerId !== null) {
        const customerRecord = db.prepare("SELECT id FROM customers WHERE id = ? AND userId = ?").get(resolvedCustomerId, req.user.id);
        if (!customerRecord) {
            return res.status(404).json({ message: "Customer not found" });
        }
    }

    let subtotal = 0;
    let gstTotal = 0;
    let discountTotal = 0;
    const invoiceItems = [];

    for (const item of items) {
        const productId = item.productId ? Number(item.productId) : null;
        const product = productId ? db.prepare("SELECT * FROM products WHERE id = ? AND userId = ?").get(productId, req.user.id) : null;
        const qty = Number(item.quantity || 1);
        const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
        const gstPercent = Number(item.gstPercent ?? item.gst ?? 0);
        const discountPercent = Number(item.discountPercent ?? item.discount ?? 0);

        if (!Number.isFinite(qty) || qty <= 0) {
            return res.status(400).json({ message: "Each billing item must have a valid quantity" });
        }

        if (!product && !item.productName) {
            return res.status(400).json({ message: "Each billing item must include a product or product name" });
        }

        if (product) {
            if (qty > Number(product.stock || 0)) {
                return res.status(400).json({ message: `Insufficient stock for ${product.productName}` });
            }
        }

        const itemSubtotal = unitPrice * qty;
        const itemGst = itemSubtotal * (gstPercent / 100);
        const itemDiscount = itemSubtotal * (discountPercent / 100);
        const lineTotal = itemSubtotal + itemGst - itemDiscount;

        subtotal += itemSubtotal;
        gstTotal += itemGst;
        discountTotal += itemDiscount;

        invoiceItems.push({
            productId,
            productName: String(item.productName || product?.productName || "Product").trim(),
            sku: String(item.sku || product?.barcode || "").trim(),
            quantity: qty,
            unitPrice,
            gstPercent,
            discountPercent,
            lineTotal,
        });
    }

    const total = subtotal + gstTotal - discountTotal;
    const paymentTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    if (paymentTotal < total - 0.01) {
        return res.status(400).json({ message: "Payment total must cover the invoice amount" });
    }

    const status = paymentTotal >= total ? "paid" : "partial";
    const invoiceNumber = generateInvoiceNumber();

    const transaction = db.transaction(() => {
        const invoiceResult = db.prepare(`
            INSERT INTO invoices (
                userId,
                customerId,
                customerName,
                contactNumber,
                email,
                invoiceNumber,
                subtotal,
                gstTotal,
                discountTotal,
                total,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            req.user.id,
            resolvedCustomerId,
            normalizedCustomerName,
            normalizedContactNumber,
            normalizedEmail,
            invoiceNumber,
            subtotal,
            gstTotal,
            discountTotal,
            total,
            status
        );

        const invoiceId = Number(invoiceResult.lastInsertRowid);

        const insertItem = db.prepare(`
            INSERT INTO invoice_items (
                userId,
                invoiceId,
                productId,
                productName,
                sku,
                quantity,
                unitPrice,
                gstPercent,
                discountPercent,
                lineTotal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        invoiceItems.forEach((item) => {
            insertItem.run(
                req.user.id,
                invoiceId,
                item.productId,
                item.productName,
                item.sku,
                item.quantity,
                item.unitPrice,
                item.gstPercent,
                item.discountPercent,
                item.lineTotal
            );

            if (item.productId) {
                const updated = db.prepare(`
                    UPDATE products
                    SET stock = stock - ?, updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ? AND userId = ? AND stock >= ?
                `).run(item.quantity, item.productId, req.user.id, item.quantity);

                if (updated.changes === 0) {
                    throw new Error(`Insufficient stock for product ID ${item.productId}`);
                }
            }
        });

        const insertPayment = db.prepare(`
            INSERT INTO invoice_payments (
                userId,
                invoiceId,
                method,
                amount
            ) VALUES (?, ?, ?, ?)
        `);

        payments.filter((payment) => Number(payment.amount || 0) > 0).forEach((payment) => {
            insertPayment.run(
                req.user.id,
                invoiceId,
                String(payment.method || "cash").trim().toLowerCase(),
                Number(payment.amount || 0)
            );
        });

        return invoiceId;
    });

    try {
        const invoiceId = transaction();
        const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND userId = ?").get(invoiceId, req.user.id);
        const items = db.prepare("SELECT * FROM invoice_items WHERE invoiceId = ? AND userId = ?").all(invoiceId, req.user.id);
        const paymentEntries = db.prepare("SELECT * FROM invoice_payments WHERE invoiceId = ? AND userId = ?").all(invoiceId, req.user.id);
        const populatedInvoice = {
            ...invoice,
            items,
            payments: paymentEntries,
        };

        const whatsappResult = await sendInvoiceWhatsApp(populatedInvoice, { ...customer, customerName: normalizedCustomerName, contactNumber: normalizedContactNumber, email: normalizedEmail }, req.user);

        return res.status(201).json({
            message: "Invoice created successfully",
            invoice: populatedInvoice,
            whatsapp: whatsappResult,
        });
    } catch (error) {
        console.error("Invoice creation failed:", error);
        return res.status(400).json({ message: error.message || "Unable to create invoice" });
    }
});

app.post("/api/products", authenticateToken, (req, res) => {
    const { productName, productPrice, sellingPrice, stock, brand, supplierId, gstPercentage, productImages, discount, barcode } = req.body;

    if (!productName || productPrice === undefined || sellingPrice === undefined || stock === undefined || !supplierId || gstPercentage === undefined) {
        return res.status(400).json({ message: "Please provide productName, productPrice, sellingPrice, stock, supplierId, and gstPercentage" });
    }

    const parsedProductPrice = parseNumericValue(productPrice);
    const parsedSellingPrice = parseNumericValue(sellingPrice);
    const parsedStock = Number.isInteger(Number(stock)) ? Number(stock) : 0;
    const parsedSupplierId = supplierId === undefined || supplierId === null || supplierId === "" ? null : Number(supplierId);
    if (parsedSupplierId === null || !Number.isInteger(parsedSupplierId) || parsedSupplierId < 1) {
        return res.status(400).json({ message: "supplierId must be a valid supplier" });
    }
    const parsedGstPercentage = parseNumericValue(gstPercentage);
    const parsedDiscount = parseNumericValue(discount, 0);
    const imagesJson = serializeProductImages(productImages);
    const generatedBarcode = String(barcode || generateBarcode()).trim();
    const normalizedBrand = String(brand || "").trim();
    const stockStatus = getStockStatus(parsedStock);

    const result = db.prepare(`
        INSERT INTO products (
            userId,
            productName,
            productPrice,
            sellingPrice,
            stock,
            brand,
            supplierId,
            gstPercentage,
            productImages,
            discount,
            barcode,
            stockStatus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.user.id,
        String(productName).trim(),
        parsedProductPrice,
        parsedSellingPrice,
        parsedStock,
        normalizedBrand,
        parsedSupplierId,
        parsedGstPercentage,
        imagesJson,
        parsedDiscount,
        generatedBarcode,
        stockStatus
    );

    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);
    return res.status(201).json({ message: "Product created successfully", product: formatProduct(product) });
});

app.put("/api/products/:id", authenticateToken, (req, res) => {
    const existing = db.prepare("SELECT * FROM products WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!existing) {
        return res.status(404).json({ message: "Product not found" });
    }

    const updates = [];
    const values = [];

    if (req.body.productName !== undefined) {
        updates.push("productName = ?");
        values.push(String(req.body.productName).trim());
    }

    if (req.body.productPrice !== undefined) {
        updates.push("productPrice = ?");
        values.push(parseNumericValue(req.body.productPrice));
    }

    if (req.body.sellingPrice !== undefined) {
        updates.push("sellingPrice = ?");
        values.push(parseNumericValue(req.body.sellingPrice));
    }

    if (req.body.stock !== undefined) {
        updates.push("stock = ?");
        values.push(Number(req.body.stock));
    }

    if (req.body.brand !== undefined) {
        updates.push("brand = ?");
        values.push(String(req.body.brand || "").trim());
    }

    if (req.body.supplierId !== undefined) {
        const parsedSupplierId = req.body.supplierId === null || req.body.supplierId === "" ? null : Number(req.body.supplierId);
        if (parsedSupplierId === null || !Number.isInteger(parsedSupplierId) || parsedSupplierId < 1) {
            return res.status(400).json({ message: "supplierId must be a valid supplier" });
        }
        updates.push("supplierId = ?");
        values.push(parsedSupplierId);
    }

    if (req.body.gstPercentage !== undefined) {
        updates.push("gstPercentage = ?");
        values.push(parseNumericValue(req.body.gstPercentage));
    }

    if (req.body.productImages !== undefined) {
        updates.push("productImages = ?");
        values.push(serializeProductImages(req.body.productImages));
    }

    if (req.body.discount !== undefined) {
        updates.push("discount = ?");
        values.push(parseNumericValue(req.body.discount, 0));
    }

    if (req.body.barcode !== undefined) {
        updates.push("barcode = ?");
        values.push(String(req.body.barcode).trim());
    }

    if (updates.length === 0) {
        return res.status(400).json({ message: "No valid product fields were provided for update" });
    }

    const nextStock = req.body.stock !== undefined ? Number(req.body.stock) : existing.stock;
    const nextStockStatus = getStockStatus(nextStock);
    updates.push("stockStatus = ?");
    values.push(nextStockStatus);
    updates.push("updatedAt = CURRENT_TIMESTAMP");

    values.push(req.params.id, req.user.id);

    db.prepare(`
        UPDATE products
        SET ${updates.join(", ")}
        WHERE id = ? AND userId = ?
    `).run(...values);

    const product = db.prepare("SELECT * FROM products WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);
    return res.json({ message: "Product updated successfully", product: formatProduct(product) });
});

app.delete("/api/products/:id", authenticateToken, (req, res) => {
    const existing = db.prepare("SELECT id FROM products WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!existing) {
        return res.status(404).json({ message: "Product not found" });
    }

    db.prepare("DELETE FROM products WHERE id = ? AND userId = ?").run(req.params.id, req.user.id);
    return res.json({ message: "Product deleted successfully" });
});

app.get("/api/products/:id/barcode", authenticateToken, (req, res) => {
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!product) {
        return res.status(404).json({ message: "Product not found" });
    }

    const barcode = product.barcode || generateBarcode();
    const sizePreset = String(req.query.size || "").toLowerCase();
    const width = Number(req.query.width || req.query.printWidth || (() => {
        if (sizePreset === "small") return 180;
        if (sizePreset === "medium") return 240;
        if (sizePreset === "large") return 320;
        return 240;
    })());
    const height = Number(req.query.height || req.query.printHeight || (() => {
        if (sizePreset === "small") return 90;
        if (sizePreset === "medium") return 120;
        if (sizePreset === "large") return 160;
        return 120;
    })());

    if (!product.barcode) {
        db.prepare("UPDATE products SET barcode = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?").run(barcode, req.params.id, req.user.id);
    }

    const barcodeSvg = createBarcodeSvg(barcode, {
        productName: product.productName,
        sellingPrice: product.sellingPrice,
        discount: product.discount,
    }, {
        width: Number.isFinite(width) && width > 0 ? width : 240,
        height: Number.isFinite(height) && height > 0 ? height : 120,
    });

    return res.json({
        message: "Barcode generated successfully",
        barcode,
        format: "CODE128",
        barcodeSvg,
        productId: Number(req.params.id),
        printSize: {
            width: Number.isFinite(width) && width > 0 ? width : 240,
            height: Number.isFinite(height) && height > 0 ? height : 120,
        },
    });
});

function formatCustomer(customer) {
    if (!customer) {
        return null;
    }

    return {
        id: customer.id,
        userId: customer.userId,
        customerName: customer.customerName,
        contactNumber: customer.contactNumber,
        email: customer.email,
        credit: Number(customer.credit || 0),
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
    };
}

app.get("/api/customers", authenticateToken, (req, res) => {
    const { search, page = "1", limit = "20", sortOrder = "desc" } = req.query;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    let query = "SELECT * FROM customers WHERE userId = ?";
    const params = [req.user.id];

    if (search) {
        const value = `%${String(search).trim()}%`;
        query += " AND (customerName LIKE ? OR email LIKE ? OR contactNumber LIKE ? )";
        params.push(value, value, value);
    }

    query += " ORDER BY createdAt " + (sortOrder === "asc" ? "ASC" : "DESC");
    const rows = db.prepare(query).all(...params);
    const start = (safePage - 1) * safeLimit;
    const paginatedRows = rows.slice(start, start + safeLimit);

    return res.json({
        message: "Customers fetched successfully",
        customers: paginatedRows.map(formatCustomer),
        pagination: {
            total: rows.length,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.max(1, Math.ceil(rows.length / safeLimit)),
        },
    });
});

app.get("/api/customers/:id", authenticateToken, (req, res) => {
    const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
    }

    return res.json({ message: "Customer fetched successfully", customer: formatCustomer(customer) });
});

app.post("/api/customers", authenticateToken, (req, res) => {
    const { customerName, contactNumber, email, credit } = req.body;

    if (!customerName || !contactNumber || !email) {
        return res.status(400).json({ message: "Please provide customerName, contactNumber, and email" });
    }

    const normalizedCustomerName = String(customerName).trim();
    const normalizedContactNumber = String(contactNumber).trim();
    const normalizedEmail = String(email).trim().toLowerCase();

    const existingConflict = db.prepare(`
        SELECT id, customerName, contactNumber, email
        FROM customers
        WHERE userId = ?
          AND (
            LOWER(customerName) = LOWER(?)
            OR contactNumber = ?
            OR LOWER(email) = LOWER(?)
          )
    `).get(req.user.id, normalizedCustomerName, normalizedContactNumber, normalizedEmail);

    if (existingConflict) {
        const errors = {};
        if (String(existingConflict.email).toLowerCase() === normalizedEmail) {
            errors.email = "A customer with this email already exists";
        } else if (existingConflict.contactNumber === normalizedContactNumber) {
            errors.contactNumber = "A customer with this phone number already exists";
        } else {
            errors.customerName = "A customer with this name already exists";
        }
        return res.status(409).json({ message: "Customer conflict", errors });
    }

    const parsedCredit = parseNumericValue(credit, 0);

    const result = db.prepare(`
        INSERT INTO customers (
            userId,
            customerName,
            contactNumber,
            email,
            credit
        ) VALUES (?, ?, ?, ?, ?)
    `).run(
        req.user.id,
        normalizedCustomerName,
        normalizedContactNumber,
        normalizedEmail,
        parsedCredit
    );

    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid);
    return res.status(201).json({ message: "Customer created successfully", customer: formatCustomer(customer) });
});

app.put("/api/customers/:id", authenticateToken, (req, res) => {
    const existing = db.prepare("SELECT * FROM customers WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!existing) {
        return res.status(404).json({ message: "Customer not found" });
    }

    const updates = [];
    const values = [];
    const conflictConditions = [];
    const conflictParams = [req.user.id, req.params.id];
    const normalizedCustomerName = req.body.customerName !== undefined ? String(req.body.customerName).trim() : undefined;
    const normalizedContactNumber = req.body.contactNumber !== undefined ? String(req.body.contactNumber).trim() : undefined;
    const normalizedEmail = req.body.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined;

    if (req.body.customerName !== undefined) {
        if (!normalizedCustomerName) {
            return res.status(400).json({ message: "customerName cannot be empty" });
        }
        updates.push("customerName = ?");
        values.push(normalizedCustomerName);
        conflictConditions.push("LOWER(customerName) = LOWER(?)");
        conflictParams.push(normalizedCustomerName);
    }

    if (req.body.contactNumber !== undefined) {
        if (!normalizedContactNumber) {
            return res.status(400).json({ message: "contactNumber cannot be empty" });
        }
        updates.push("contactNumber = ?");
        values.push(normalizedContactNumber);
        conflictConditions.push("contactNumber = ?");
        conflictParams.push(normalizedContactNumber);
    }

    if (req.body.email !== undefined) {
        if (!normalizedEmail) {
            return res.status(400).json({ message: "email cannot be empty" });
        }
        updates.push("email = ?");
        values.push(normalizedEmail);
        conflictConditions.push("LOWER(email) = LOWER(?)");
        conflictParams.push(normalizedEmail);
    }

    if (req.body.credit !== undefined) {
        updates.push("credit = ?");
        values.push(parseNumericValue(req.body.credit, 0));
    }

    if (conflictConditions.length > 0) {
        const duplicate = db.prepare(`
            SELECT id, customerName, contactNumber, email
            FROM customers
            WHERE userId = ?
              AND id != ?
              AND (${conflictConditions.join(" OR ")})
        `).get(...conflictParams);

        if (duplicate) {
            const errors = {};
            if (normalizedEmail !== undefined && String(duplicate.email).toLowerCase() === normalizedEmail) {
                errors.email = "A customer with this email already exists";
            } else if (normalizedContactNumber !== undefined && duplicate.contactNumber === normalizedContactNumber) {
                errors.contactNumber = "A customer with this phone number already exists";
            } else if (normalizedCustomerName !== undefined && duplicate.customerName.toLowerCase() === normalizedCustomerName.toLowerCase()) {
                errors.customerName = "A customer with this name already exists";
            }
            return res.status(409).json({ message: "Customer conflict", errors });
        }
    }

    if (updates.length === 0) {
        return res.status(400).json({ message: "No valid customer fields were provided for update" });
    }

    updates.push("updatedAt = CURRENT_TIMESTAMP");
    values.push(req.params.id, req.user.id);

    db.prepare(`
        UPDATE customers
        SET ${updates.join(", ")}
        WHERE id = ? AND userId = ?
    `).run(...values);

    const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);
    return res.json({ message: "Customer updated successfully", customer: formatCustomer(customer) });
});

app.delete("/api/customers/:id", authenticateToken, (req, res) => {
    const existing = db.prepare("SELECT id FROM customers WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!existing) {
        return res.status(404).json({ message: "Customer not found" });
    }

    db.prepare("DELETE FROM customers WHERE id = ? AND userId = ?").run(req.params.id, req.user.id);
    return res.json({ message: "Customer deleted successfully" });
});

function formatSupplier(supplier) {
    if (!supplier) {
        return null;
    }

    return {
        id: supplier.id,
        userId: supplier.userId,
        supplierName: supplier.supplierName,
        companyName: supplier.companyName,
        contactNumber: supplier.contactNumber,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
        createdAt: supplier.createdAt,
        updatedAt: supplier.updatedAt,
    };
}

app.get("/api/suppliers", authenticateToken, (req, res) => {
    const { search, page = "1", limit = "20", sortOrder = "desc" } = req.query;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    let query = "SELECT * FROM suppliers WHERE userId = ?";
    const params = [req.user.id];

    if (search) {
        const value = `%${String(search).trim()}%`;
        query += " AND (supplierName LIKE ? OR companyName LIKE ? OR email LIKE ? OR contactNumber LIKE ? )";
        params.push(value, value, value, value);
    }

    query += " ORDER BY createdAt " + (sortOrder === "asc" ? "ASC" : "DESC");
    const rows = db.prepare(query).all(...params);
    const start = (safePage - 1) * safeLimit;
    const paginatedRows = rows.slice(start, start + safeLimit);

    return res.json({
        message: "Suppliers fetched successfully",
        suppliers: paginatedRows.map(formatSupplier),
        pagination: {
            total: rows.length,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.max(1, Math.ceil(rows.length / safeLimit)),
        },
    });
});

app.get("/api/suppliers/:id", authenticateToken, (req, res) => {
    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!supplier) {
        return res.status(404).json({ message: "Supplier not found" });
    }

    return res.json({ message: "Supplier fetched successfully", supplier: formatSupplier(supplier) });
});

app.post("/api/suppliers", authenticateToken, (req, res) => {
    const { supplierName, companyName, contactNumber, email, address, notes } = req.body;

    if (!supplierName || !companyName || !contactNumber || !email) {
        return res.status(400).json({ message: "Please provide supplierName, companyName, contactNumber, and email" });
    }

    const result = db.prepare(`
        INSERT INTO suppliers (
            userId,
            supplierName,
            companyName,
            contactNumber,
            email,
            address,
            notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.user.id,
        String(supplierName).trim(),
        String(companyName).trim(),
        String(contactNumber).trim(),
        String(email).trim(),
        String(address || "").trim(),
        String(notes || "").trim()
    );

    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(result.lastInsertRowid);
    return res.status(201).json({ message: "Supplier created successfully", supplier: formatSupplier(supplier) });
});

app.put("/api/suppliers/:id", authenticateToken, (req, res) => {
    const existing = db.prepare("SELECT * FROM suppliers WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!existing) {
        return res.status(404).json({ message: "Supplier not found" });
    }

    const updates = [];
    const values = [];

    if (req.body.supplierName !== undefined) {
        updates.push("supplierName = ?");
        values.push(String(req.body.supplierName).trim());
    }

    if (req.body.companyName !== undefined) {
        updates.push("companyName = ?");
        values.push(String(req.body.companyName).trim());
    }

    if (req.body.contactNumber !== undefined) {
        updates.push("contactNumber = ?");
        values.push(String(req.body.contactNumber).trim());
    }

    if (req.body.email !== undefined) {
        updates.push("email = ?");
        values.push(String(req.body.email).trim());
    }

    if (req.body.address !== undefined) {
        updates.push("address = ?");
        values.push(String(req.body.address).trim());
    }

    if (req.body.notes !== undefined) {
        updates.push("notes = ?");
        values.push(String(req.body.notes).trim());
    }

    if (updates.length === 0) {
        return res.status(400).json({ message: "No valid supplier fields were provided for update" });
    }

    updates.push("updatedAt = CURRENT_TIMESTAMP");
    values.push(req.params.id, req.user.id);

    db.prepare(`
        UPDATE suppliers
        SET ${updates.join(", ")}
        WHERE id = ? AND userId = ?
    `).run(...values);

    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);
    return res.json({ message: "Supplier updated successfully", supplier: formatSupplier(supplier) });
});

app.delete("/api/suppliers/:id", authenticateToken, (req, res) => {
    const existing = db.prepare("SELECT id FROM suppliers WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!existing) {
        return res.status(404).json({ message: "Supplier not found" });
    }

    db.prepare("DELETE FROM suppliers WHERE id = ? AND userId = ?").run(req.params.id, req.user.id);
    return res.json({ message: "Supplier deleted successfully" });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});