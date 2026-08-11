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
const cron = require("node-cron");
const PDFDocument = require("pdfkit");
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

function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some((column) => column.name === columnName)) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
}

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
    CREATE TABLE IF NOT EXISTS invoice_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        invoiceId INTEGER NOT NULL,
        customerId INTEGER NOT NULL,
        creditAmount REAL NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id),
        FOREIGN KEY(invoiceId) REFERENCES invoices(id),
        FOREIGN KEY(customerId) REFERENCES customers(id)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_return_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        returnId INTEGER NOT NULL,
        invoiceItemId INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        creditAmount REAL NOT NULL DEFAULT 0,
        FOREIGN KEY(returnId) REFERENCES invoice_returns(id),
        FOREIGN KEY(invoiceItemId) REFERENCES invoice_items(id)
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

ensureColumn("products", "internalProductName", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "internalReference", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "internalGstPercentage", "REAL");
ensureColumn("invoice_items", "internalProductName", "TEXT NOT NULL DEFAULT ''");
ensureColumn("invoice_items", "internalReference", "TEXT NOT NULL DEFAULT ''");
ensureColumn("invoice_items", "internalGstPercentage", "REAL");

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
        internalProductName: product.internalProductName || "",
        internalReference: product.internalReference || "",
        internalGstPercentage: product.internalGstPercentage == null ? null : Number(product.internalGstPercentage),
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

function createEmailTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || "smtp.gmail.com",
        port: Number(process.env.EMAIL_PORT || 587),
        secure: Number(process.env.EMAIL_PORT || 587) === 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function generateDailySummaryEmail(user, report) {
    const invoiceRows = report.invoices.length
        ? report.invoices.map((invoice) => {
            const products = invoice.items
                .map(
                    (item) =>
                        `${escapeHtml(item.productName)} × ${item.quantity}`
                )
                .join("<br>");

            return `
                <tr>
                    <td>
                        <strong>
                            ${escapeHtml(invoice.invoiceNumber)}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(invoice.customerName)}
                    </td>

                    <td>
                        ${products || "-"}
                    </td>

                    <td>
                        ${invoice.items.reduce(
                (sum, item) => sum + Number(item.quantity || 0),
                0
            )}
                    </td>

                    <td>
                        ${formatCurrency(invoice.subtotal)}
                    </td>

                    <td>
                        ${formatCurrency(invoice.gstTotal)}
                    </td>

                    <td>
                        ${formatCurrency(invoice.discountTotal)}
                    </td>

                    <td>
                        <strong>
                            ${formatCurrency(invoice.total)}
                        </strong>
                    </td>

                    <td>
                        ${escapeHtml(invoice.paymentMethods || "-")}
                    </td>
                </tr>
            `;
        }).join("")
        : `
            <tr>
                <td colspan="9" style="text-align:center;padding:30px;">
                    No orders were created today.
                </td>
            </tr>
        `;

    return `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<style>

body {
    margin: 0;
    padding: 0;
    background: #f4f4f4;
    font-family: Arial, Helvetica, sans-serif;
    color: #222;
}

.container {
    max-width: 1100px;
    margin: 30px auto;
    background: #ffffff;
    border: 1px solid #e5e5e5;
}

.header {
    background: #111111;
    color: #ffffff;
    padding: 30px;
}

.header h1 {
    margin: 0 0 8px;
    font-size: 26px;
}

.header p {
    margin: 0;
    color: #cccccc;
}

.content {
    padding: 30px;
}

.stats {
    display: table;
    width: 100%;
    border-spacing: 8px;
    margin-left: -8px;
    margin-right: -8px;
}

.stat {
    display: table-cell;
    width: 25%;
    background: #f7f7f7;
    border: 1px solid #eeeeee;
    padding: 16px;
}

.stat-label {
    font-size: 11px;
    color: #777777;
    margin-bottom: 7px;
}

.stat-value {
    font-size: 20px;
    font-weight: bold;
}

.section-title {
    font-size: 18px;
    font-weight: bold;
    margin: 30px 0 15px;
}

.payment-box {
    display: table;
    width: 100%;
    border-spacing: 8px;
    margin-left: -8px;
}

.payment {
    display: table-cell;
    padding: 15px;
    background: #fafafa;
    border: 1px solid #eeeeee;
}

.payment-label {
    font-size: 11px;
    color: #777777;
}

.payment-value {
    margin-top: 5px;
    font-weight: bold;
    font-size: 16px;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
}

th {
    padding: 10px 7px;
    background: #f5f5f5;
    border-bottom: 1px solid #dddddd;
    text-align: left;
}

td {
    padding: 10px 7px;
    border-bottom: 1px solid #eeeeee;
    vertical-align: top;
}

.total-box {
    margin-top: 25px;
    padding: 20px;
    background: #111111;
    color: #ffffff;
    text-align: right;
}

.total-label {
    font-size: 12px;
    color: #cccccc;
}

.total-value {
    font-size: 24px;
    font-weight: bold;
    margin-top: 5px;
}

.footer {
    padding: 20px;
    text-align: center;
    color: #888888;
    font-size: 11px;
    background: #fafafa;
}

</style>

</head>

<body>

<div class="container">

    <div class="header">

        <h1>
            Daily Sales Report
        </h1>

        <p>
            ${escapeHtml(user.companyName)}
            ·
            ${escapeHtml(report.date)}
        </p>

    </div>

    <div class="content">

        <div class="stats">

            <div class="stat">
                <div class="stat-label">
                    Customers Visited
                </div>

                <div class="stat-value">
                    ${report.customersVisited}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    New Customers
                </div>

                <div class="stat-value">
                    ${report.newCustomers}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    Orders
                </div>

                <div class="stat-value">
                    ${report.orders}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    Products Sold
                </div>

                <div class="stat-value">
                    ${report.productsSold}
                </div>
            </div>

        </div>

        <div class="stats">

            <div class="stat">
                <div class="stat-label">
                    Gross Sales
                </div>

                <div class="stat-value">
                    ${formatCurrency(report.grossSales)}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    GST Collected
                </div>

                <div class="stat-value">
                    ${formatCurrency(report.gstCollected)}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    Discounts
                </div>

                <div class="stat-value">
                    ${formatCurrency(report.discounts)}
                </div>
            </div>

            <div class="stat">
                <div class="stat-label">
                    Net Revenue
                </div>

                <div class="stat-value">
                    ${formatCurrency(report.netRevenue)}
                </div>
            </div>

        </div>


        <div class="section-title">
            Payment Summary
        </div>

        <div class="payment-box">

            <div class="payment">
                <div class="payment-label">
                    CASH
                </div>

                <div class="payment-value">
                    ${formatCurrency(report.cashReceived)}
                </div>
            </div>

            <div class="payment">
                <div class="payment-label">
                    UPI
                </div>

                <div class="payment-value">
                    ${formatCurrency(report.upiReceived)}
                </div>
            </div>

            <div class="payment">
                <div class="payment-label">
                    CARD
                </div>

                <div class="payment-value">
                    ${formatCurrency(report.cardReceived)}
                </div>
            </div>

            <div class="payment">
                <div class="payment-label">
                    OTHER
                </div>

                <div class="payment-value">
                    ${formatCurrency(report.otherReceived)}
                </div>
            </div>

            <div class="payment">
                <div class="payment-label">
                    OUTSTANDING
                </div>

                <div class="payment-value">
                    ${formatCurrency(report.outstanding)}
                </div>
            </div>

        </div>


        <div class="section-title">
            Invoice Breakdown
        </div>

        <table>

            <thead>

                <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Products</th>
                    <th>Qty</th>
                    <th>Subtotal</th>
                    <th>GST</th>
                    <th>Discount</th>
                    <th>Total</th>
                    <th>Payment</th>
                </tr>

            </thead>

            <tbody>

                ${invoiceRows}

            </tbody>

        </table>


        <div class="total-box">

            <div class="total-label">
                Net Revenue
            </div>

            <div class="total-value">
                ${formatCurrency(report.netRevenue)}
            </div>

        </div>

    </div>


    <div class="footer">

        Daily sales report generated automatically by
        ${escapeHtml(user.companyName)}.

        <br>

        PDF report is attached to this email.

    </div>

</div>

</body>

</html>
`;
}

async function sendDailySummaryEmail(userId) {
    const user = db.prepare(`
        SELECT
            id,
            companyName,
            ownerName,
            email
        FROM users
        WHERE id = ?
    `).get(userId);

    if (!user) {
        throw new Error("User not found");
    }

    if (!user.email) {
        throw new Error("User does not have an email address");
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error(
            "EMAIL_USER and EMAIL_PASS are not configured"
        );
    }

    const report = getTodaySalesReport(userId);

    const html = generateDailySummaryEmail(
        user,
        report
    );

    const pdfBuffer = await generateDailySalesPdf(
        user,
        report
    );

    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || "smtp.gmail.com",

        port: Number(
            process.env.EMAIL_PORT || 587
        ),

        secure:
            Number(
                process.env.EMAIL_PORT || 587
            ) === 465,

        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const pdfFileName =
        `Daily-Sales-${report.date}.pdf`;

    const info = await transporter.sendMail({
        from:
            process.env.EMAIL_FROM ||
            process.env.EMAIL_USER,

        to: user.email,

        subject:
            `Daily Sales Report - ${report.date} - ${user.companyName}`,

        html,

        attachments: [
            {
                filename: pdfFileName,
                content: pdfBuffer,
                contentType: "application/pdf",
            },
        ],
    });

    console.log(
        `[Daily Summary] Email sent to ${user.email}: ${info.messageId}`
    );

    return {
        success: true,
        messageId: info.messageId,
        recipient: user.email,
        pdfFileName,
        report,
    };
}

function getTodayDateString() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function getTodaySalesReport(userId) {
    const today = getTodayDateString();

    // ----------------------------------------
    // BASIC SALES SUMMARY
    // ----------------------------------------

    const sales = db.prepare(`
        SELECT
            COUNT(*) AS orders,
            COALESCE(SUM(subtotal), 0) AS grossSales,
            COALESCE(SUM(gstTotal), 0) AS gstCollected,
            COALESCE(SUM(discountTotal), 0) AS discounts,
            COALESCE(SUM(total), 0) AS netRevenue
        FROM invoices
        WHERE userId = ?
          AND DATE(createdAt, '+5 hours', '+30 minutes') = ?
    `).get(userId, today);

    // ----------------------------------------
    // PRODUCTS SOLD
    // ----------------------------------------

    const products = db.prepare(`
        SELECT
            COALESCE(SUM(ii.quantity), 0) AS productsSold
        FROM invoice_items ii
        INNER JOIN invoices i
            ON i.id = ii.invoiceId
        WHERE ii.userId = ?
          AND DATE(i.createdAt, '+5 hours', '+30 minutes') = ?
    `).get(userId, today);

    // ----------------------------------------
    // CUSTOMERS VISITED
    //
    // Registered customers = distinct customerId
    // Walk-in customers = each invoice without customerId
    // ----------------------------------------

    const customers = db.prepare(`
        SELECT COUNT(*) AS customersVisited
        FROM (
            SELECT DISTINCT
                CASE
                    WHEN customerId IS NOT NULL
                        THEN 'customer-' || customerId
                    ELSE
                        'walkin-' || id
                END AS customerKey
            FROM invoices
            WHERE userId = ?
              AND DATE(createdAt, '+5 hours', '+30 minutes') = ?
        )
    `).get(userId, today);

    // ----------------------------------------
    // NEW CUSTOMERS
    // ----------------------------------------

    const newCustomers = db.prepare(`
        SELECT COUNT(*) AS newCustomers
        FROM customers
        WHERE userId = ?
          AND DATE(createdAt, '+5 hours', '+30 minutes') = ?
    `).get(userId, today);

    // ----------------------------------------
    // PAYMENT SUMMARY
    // ----------------------------------------

    const paymentRows = db.prepare(`
        SELECT
            LOWER(method) AS method,
            COALESCE(SUM(amount), 0) AS amount
        FROM invoice_payments
        WHERE userId = ?
          AND DATE(createdAt, '+5 hours', '+30 minutes') = ?
        GROUP BY LOWER(method)
    `).all(userId, today);

    const payments = {
        cash: 0,
        upi: 0,
        card: 0,
        other: 0,
    };

    paymentRows.forEach((payment) => {
        const method = String(payment.method || "").toLowerCase();
        const amount = Number(payment.amount || 0);

        if (method === "cash") {
            payments.cash += amount;
        } else if (method === "upi") {
            payments.upi += amount;
        } else if (
            method === "card" ||
            method === "credit_card" ||
            method === "debit_card"
        ) {
            payments.card += amount;
        } else {
            payments.other += amount;
        }
    });

    // ----------------------------------------
    // OUTSTANDING
    //
    // Invoice total - payments made against
    // today's invoices.
    // ----------------------------------------

    const outstandingResult = db.prepare(`
        SELECT
            COALESCE(
                SUM(
                    CASE
                        WHEN i.total > COALESCE(p.paidAmount, 0)
                        THEN i.total - COALESCE(p.paidAmount, 0)
                        ELSE 0
                    END
                ),
                0
            ) AS outstanding
        FROM invoices i
        LEFT JOIN (
            SELECT
                invoiceId,
                SUM(amount) AS paidAmount
            FROM invoice_payments
            WHERE userId = ?
            GROUP BY invoiceId
        ) p
            ON p.invoiceId = i.id
        WHERE i.userId = ?
          AND DATE(i.createdAt, '+5 hours', '+30 minutes') = ?
    `).get(userId, userId, today);

    // ----------------------------------------
    // TODAY'S INVOICES
    // ----------------------------------------

    const invoices = db.prepare(`
        SELECT
            i.id,
            i.invoiceNumber,
            i.customerName,
            i.contactNumber,
            i.email,
            i.subtotal,
            i.gstTotal,
            i.discountTotal,
            i.total,
            i.status,
            i.createdAt
        FROM invoices i
        WHERE i.userId = ?
          AND DATE(i.createdAt, '+5 hours', '+30 minutes') = ?
        ORDER BY i.createdAt ASC
    `).all(userId, today);

    // ----------------------------------------
    // INVOICE ITEMS
    // ----------------------------------------

    const items = db.prepare(`
        SELECT
            invoiceId,
            productName,
            sku,
            quantity,
            unitPrice,
            gstPercent,
            discountPercent,
            lineTotal
        FROM invoice_items
        WHERE userId = ?
          AND invoiceId IN (
              SELECT id
              FROM invoices
              WHERE userId = ?
                AND DATE(createdAt, '+5 hours', '+30 minutes') = ?
          )
        ORDER BY invoiceId ASC
    `).all(userId, userId, today);

    // ----------------------------------------
    // PAYMENT METHODS PER INVOICE
    // ----------------------------------------

    const invoicePayments = db.prepare(`
        SELECT
            invoiceId,
            method,
            SUM(amount) AS amount
        FROM invoice_payments
        WHERE userId = ?
          AND invoiceId IN (
              SELECT id
              FROM invoices
              WHERE userId = ?
                AND DATE(createdAt, '+5 hours', '+30 minutes') = ?
          )
        GROUP BY invoiceId, method
    `).all(userId, userId, today);

    const itemsMap = {};
    const paymentsMap = {};

    items.forEach((item) => {
        if (!itemsMap[item.invoiceId]) {
            itemsMap[item.invoiceId] = [];
        }

        itemsMap[item.invoiceId].push(item);
    });

    invoicePayments.forEach((payment) => {
        if (!paymentsMap[payment.invoiceId]) {
            paymentsMap[payment.invoiceId] = [];
        }

        paymentsMap[payment.invoiceId].push({
            method: payment.method,
            amount: Number(payment.amount || 0),
        });
    });

    const formattedInvoices = invoices.map((invoice) => {
        const invoicePaymentList = paymentsMap[invoice.id] || [];

        return {
            ...invoice,

            subtotal: Number(invoice.subtotal || 0),
            gstTotal: Number(invoice.gstTotal || 0),
            discountTotal: Number(invoice.discountTotal || 0),
            total: Number(invoice.total || 0),

            items: itemsMap[invoice.id] || [],

            payments: invoicePaymentList,

            paymentMethods: invoicePaymentList
                .map(
                    (payment) =>
                        `${String(payment.method).toUpperCase()}: ${formatCurrency(payment.amount)}`
                )
                .join(" / "),
        };
    });

    return {
        date: today,

        customersVisited: Number(
            customers?.customersVisited || 0
        ),

        newCustomers: Number(
            newCustomers?.newCustomers || 0
        ),

        orders: Number(
            sales?.orders || 0
        ),

        productsSold: Number(
            products?.productsSold || 0
        ),

        grossSales: Number(
            sales?.grossSales || 0
        ),

        gstCollected: Number(
            sales?.gstCollected || 0
        ),

        discounts: Number(
            sales?.discounts || 0
        ),

        netRevenue: Number(
            sales?.netRevenue || 0
        ),

        cashReceived: payments.cash,
        upiReceived: payments.upi,
        cardReceived: payments.card,
        otherReceived: payments.other,

        outstanding: Number(
            outstandingResult?.outstanding || 0
        ),

        invoices: formattedInvoices,
    };
}

function generateDailySalesPdf(user, report) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: "A4",
            margin: 40,
        });

        const chunks = [];

        doc.on("data", (chunk) => {
            chunks.push(chunk);
        });

        doc.on("end", () => {
            resolve(Buffer.concat(chunks));
        });

        doc.on("error", reject);

        // ----------------------------------------
        // HEADER
        // ----------------------------------------

        doc
            .fontSize(22)
            .font("Helvetica-Bold")
            .text("Daily Sales Report");

        doc
            .moveDown(0.3)
            .fontSize(11)
            .font("Helvetica")
            .text(user.companyName);

        doc
            .fontSize(10)
            .fillColor("#666666")
            .text(`Date: ${report.date}`);

        doc.moveDown();

        // ----------------------------------------
        // SUMMARY BOX
        // ----------------------------------------

        doc
            .fillColor("#000000")
            .fontSize(15)
            .font("Helvetica-Bold")
            .text("Sales Summary");

        doc.moveDown(0.5);

        const summaryRows = [
            ["Customers Visited", report.customersVisited],
            ["New Customers", report.newCustomers],
            ["Orders", report.orders],
            ["Products Sold", report.productsSold],
            ["Gross Sales", formatCurrency(report.grossSales)],
            ["GST Collected", formatCurrency(report.gstCollected)],
            ["Discounts", formatCurrency(report.discounts)],
            ["Net Revenue", formatCurrency(report.netRevenue)],
            ["Cash Received", formatCurrency(report.cashReceived)],
            ["UPI Received", formatCurrency(report.upiReceived)],
            ["Card Received", formatCurrency(report.cardReceived)],
            ["Other Payments", formatCurrency(report.otherReceived)],
            ["Outstanding", formatCurrency(report.outstanding)],
        ];

        summaryRows.forEach(([label, value]) => {
            doc
                .font("Helvetica")
                .fontSize(10)
                .text(label, {
                    continued: true,
                    width: 300,
                })
                .font("Helvetica-Bold")
                .text(String(value), {
                    align: "right",
                });

            doc.moveDown(0.2);
        });

        doc.moveDown();

        // ----------------------------------------
        // ORDER BREAKDOWN
        // ----------------------------------------

        doc
            .fontSize(15)
            .font("Helvetica-Bold")
            .text("Invoice Breakdown");

        doc.moveDown();

        report.invoices.forEach((invoice, index) => {
            // New page if required
            if (doc.y > 700) {
                doc.addPage();
            }

            doc
                .fontSize(12)
                .font("Helvetica-Bold")
                .text(
                    `${invoice.invoiceNumber} — ${invoice.customerName}`
                );

            doc
                .fontSize(9)
                .font("Helvetica")
                .fillColor("#555555")
                .text(
                    `Payment: ${invoice.paymentMethods || "N/A"}`
                );

            doc.moveDown(0.3);

            invoice.items.forEach((item) => {
                doc
                    .fillColor("#000000")
                    .fontSize(9)
                    .text(
                        `${item.productName} × ${item.quantity}    ${formatCurrency(item.lineTotal)}`
                    );
            });

            doc.moveDown(0.3);

            doc
                .font("Helvetica")
                .fontSize(9)
                .text(
                    `Subtotal: ${formatCurrency(invoice.subtotal)}`
                );

            doc.text(
                `GST: ${formatCurrency(invoice.gstTotal)}`
            );

            doc.text(
                `Discount: ${formatCurrency(invoice.discountTotal)}`
            );

            doc
                .font("Helvetica-Bold")
                .text(
                    `Total: ${formatCurrency(invoice.total)}`
                );

            doc.moveDown();

            if (index < report.invoices.length - 1) {
                doc
                    .moveTo(40, doc.y)
                    .lineTo(555, doc.y)
                    .strokeColor("#dddddd")
                    .stroke();

                doc.moveDown();
            }
        });

        if (report.invoices.length === 0) {
            doc
                .fontSize(11)
                .font("Helvetica")
                .fillColor("#666666")
                .text("No orders were created today.");
        }

        // ----------------------------------------
        // FOOTER
        // ----------------------------------------

        doc.moveDown(2);

        doc
            .fontSize(8)
            .fillColor("#888888")
            .text(
                `Generated automatically by Billing Software · ${report.date}`,
                {
                    align: "center",
                }
            );

        doc.end();
    });
}

app.get("/", (req, res) => {
    res.send("Backend Running");
});

app.get("/api/dashboard", authenticateToken, (req, res) => {
    const today = getTodayDateString();
    const period = ["month", "year", "total"].includes(String(req.query.period || "month").toLowerCase())
        ? String(req.query.period || "month").toLowerCase()
        : "month";
    const periodClause = period === "month"
        ? "strftime('%Y-%m', datetime(createdAt, '+5 hours', '+30 minutes')) = strftime('%Y-%m', 'now', '+5 hours', '+30 minutes')"
        : period === "year"
            ? "strftime('%Y', datetime(createdAt, '+5 hours', '+30 minutes')) = strftime('%Y', 'now', '+5 hours', '+30 minutes')"
            : "1 = 1";
    const periodLabel = period === "month" ? "This month" : period === "year" ? "This year" : "All time";
    const todayClause = "DATE(createdAt, '+5 hours', '+30 minutes') = ?";
    const totals = db.prepare(`
        SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
        FROM invoices WHERE userId = ? AND ${periodClause}
    `).get(req.user.id);
    const todayTotals = db.prepare(`
        SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
        FROM invoices WHERE userId = ? AND ${todayClause}
    `).get(req.user.id, today);
    const customerTotals = db.prepare(`
        SELECT COUNT(*) AS customers,
               COALESCE(SUM(CASE WHEN ${periodClause} THEN 1 ELSE 0 END), 0) AS newCustomers,
               COALESCE(SUM(credit), 0) AS creditOutstanding
        FROM customers WHERE userId = ?
    `).get(req.user.id);
    const stock = db.prepare(`
        SELECT COUNT(*) AS products,
               COALESCE(SUM(stock), 0) AS units,
               COALESCE(SUM(CASE WHEN stock <= 5 THEN 1 ELSE 0 END), 0) AS lowStock,
               COALESCE(SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END), 0) AS outOfStock
        FROM products WHERE userId = ?
    `).get(req.user.id);
    const pendingInvoices = db.prepare("SELECT COUNT(*) AS count FROM invoices WHERE userId = ? AND status != 'paid'").get(req.user.id);
    const recentInvoices = db.prepare(`
        SELECT id, invoiceNumber, customerName, total, status, createdAt
        FROM invoices WHERE userId = ? AND ${periodClause} ORDER BY createdAt DESC LIMIT 5
    `).all(req.user.id);

    return res.json({
        message: "Dashboard fetched successfully",
        period,
        periodLabel,
        summary: {
            revenue: Number(totals.revenue || 0), orders: Number(totals.orders || 0),
            customers: Number(customerTotals.customers || 0), products: Number(stock.products || 0),
            stockUnits: Number(stock.units || 0), lowStock: Number(stock.lowStock || 0),
            outOfStock: Number(stock.outOfStock || 0), pendingInvoices: Number(pendingInvoices.count || 0),
            customerCredit: Number(customerTotals.creditOutstanding || 0), todayRevenue: Number(todayTotals.revenue || 0),
            todayOrders: Number(todayTotals.orders || 0), newCustomers: Number(customerTotals.newCustomers || 0),
        },
        recentInvoices,
    });
});

function getSalesAssistantData(userId) {
    const sales = db.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN datetime(createdAt) >= datetime('now', '-30 days') THEN total ELSE 0 END), 0) AS revenue30Days,
            COALESCE(SUM(CASE WHEN datetime(createdAt) >= datetime('now', '-60 days') AND datetime(createdAt) < datetime('now', '-30 days') THEN total ELSE 0 END), 0) AS previousRevenue30Days,
            COALESCE(SUM(CASE WHEN datetime(createdAt) >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) AS orders30Days
        FROM invoices
        WHERE userId = ?
    `).get(userId);

    const products = db.prepare(`
        SELECT
            p.id,
            p.productName,
            p.stock,
            p.sellingPrice,
            COALESCE(SUM(CASE WHEN datetime(i.createdAt) >= datetime('now', '-30 days') THEN ii.quantity ELSE 0 END), 0) AS units30Days,
            COALESCE(SUM(CASE WHEN datetime(i.createdAt) >= datetime('now', '-60 days') AND datetime(i.createdAt) < datetime('now', '-30 days') THEN ii.quantity ELSE 0 END), 0) AS previousUnits30Days,
            COALESCE(SUM(CASE WHEN datetime(i.createdAt) >= datetime('now', '-30 days') THEN ii.lineTotal ELSE 0 END), 0) AS revenue30Days
        FROM products p
        LEFT JOIN invoice_items ii ON ii.productId = p.id AND ii.userId = p.userId
        LEFT JOIN invoices i ON i.id = ii.invoiceId AND i.userId = p.userId
        WHERE p.userId = ?
        GROUP BY p.id
    `).all(userId).map((product) => ({
        ...product,
        stock: Number(product.stock || 0),
        sellingPrice: Number(product.sellingPrice || 0),
        units30Days: Number(product.units30Days || 0),
        previousUnits30Days: Number(product.previousUnits30Days || 0),
        revenue30Days: Number(product.revenue30Days || 0),
    }));

    const topCustomers = db.prepare(`
        SELECT
            COALESCE(NULLIF(i.customerName, ''), 'Walk-in Customer') AS customerName,
            COUNT(*) AS orders,
            COALESCE(SUM(i.total), 0) AS spent
        FROM invoices i
        WHERE i.userId = ? AND datetime(i.createdAt) >= datetime('now', '-30 days')
        GROUP BY COALESCE(NULLIF(i.customerName, ''), 'Walk-in Customer')
        ORDER BY spent DESC
        LIMIT 5
    `).all(userId).map((customer) => ({ ...customer, orders: Number(customer.orders || 0), spent: Number(customer.spent || 0) }));

    const topProducts = [...products]
        .filter((product) => product.units30Days > 0)
        .sort((a, b) => b.units30Days - a.units30Days || b.revenue30Days - a.revenue30Days)
        .slice(0, 5);
    const lowDemandProducts = [...products]
        .filter((product) => product.stock > 0)
        .sort((a, b) => a.units30Days - b.units30Days || b.stock - a.stock)
        .slice(0, 5);
    const lowStockProducts = products.filter((product) => product.stock <= 5).sort((a, b) => a.stock - b.stock).slice(0, 5);
    const revenue30Days = Number(sales.revenue30Days || 0);
    const previousRevenue30Days = Number(sales.previousRevenue30Days || 0);
    const revenueChangePercent = previousRevenue30Days > 0
        ? ((revenue30Days - previousRevenue30Days) / previousRevenue30Days) * 100
        : null;

    return {
        periodLabel: "last 30 days",
        sales: { revenue30Days, previousRevenue30Days, orders30Days: Number(sales.orders30Days || 0), revenueChangePercent },
        topProducts,
        lowDemandProducts,
        lowStockProducts,
        topCustomers,
        products,
    };
}

function money(value) {
    return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function productList(products, metric) {
    return products.length ? products.map((product) => `${product.productName} (${metric(product)})`).join(", ") : "No matching products yet";
}

function answerSalesQuestion(question, data) {
    const normalizedQuestion = String(question || "").trim().toLowerCase();
    const { sales, topProducts, lowDemandProducts, lowStockProducts, topCustomers, products } = data;
    const salesSummary = `Sales in the ${data.periodLabel}: ${money(sales.revenue30Days)} from ${sales.orders30Days} order${sales.orders30Days === 1 ? "" : "s"}${sales.revenueChangePercent === null ? "." : `, ${sales.revenueChangePercent >= 0 ? "up" : "down"} ${Math.abs(sales.revenueChangePercent).toFixed(1)}% versus the prior 30 days.`}`;

    const namedProduct = products.find((product) => normalizedQuestion.includes(product.productName.toLowerCase()));
    if (namedProduct) {
        return `${namedProduct.productName}: ${namedProduct.units30Days} unit${namedProduct.units30Days === 1 ? "" : "s"} sold in the last 30 days (${money(namedProduct.revenue30Days)} sales), ${namedProduct.stock} in stock. ${namedProduct.previousUnits30Days ? `That compares with ${namedProduct.previousUnits30Days} units in the previous 30 days.` : "There were no recorded sales in the previous 30 days."}`;
    }
    if (/low stock|stock|reorder|inventory/.test(normalizedQuestion)) {
        return lowStockProducts.length
            ? `Reorder soon: ${productList(lowStockProducts, (product) => `${product.stock} left`)}.`
            : "No products are currently at or below the low-stock threshold of 5 units.";
    }
    if (/low demand|slow|not selling|least|worst/.test(normalizedQuestion)) {
        return `Slow-moving products with stock on hand: ${productList(lowDemandProducts, (product) => `${product.units30Days} sold, ${product.stock} in stock`)}. Consider a promotion, bundle, or reduced reorder quantity for products with no sales.`;
    }
    if (/customer|buyer|who buys|top client/.test(normalizedQuestion)) {
        return topCustomers.length
            ? `Top customers in the last 30 days: ${topCustomers.map((customer) => `${customer.customerName} (${money(customer.spent)}, ${customer.orders} orders)`).join(", ")}.`
            : "There are no customer purchases in the last 30 days.";
    }
    if (/demand|top|best|popular|selling product|product sell/.test(normalizedQuestion)) {
        return topProducts.length
            ? `Highest-demand products in the last 30 days: ${productList(topProducts, (product) => `${product.units30Days} units, ${money(product.revenue30Days)}`)}.`
            : "No product sales were recorded in the last 30 days.";
    }
    if (/revenue|sale|sales|order|income|turnover/.test(normalizedQuestion)) return salesSummary;

    return `${salesSummary} Top-demand products: ${productList(topProducts.slice(0, 3), (product) => `${product.units30Days} units`)}. You can ask about top products, low demand, stock to reorder, a product by name, or top customers.`;
}

app.get("/api/sales-assistant/insights", authenticateToken, (req, res) => {
    const data = getSalesAssistantData(req.user.id);
    return res.json({
        message: "Sales insights generated successfully",
        ...data,
        products: undefined,
    });
});

app.post("/api/sales-assistant/ask", authenticateToken, (req, res) => {
    const question = String(req.body?.question || "").trim();
    if (!question) return res.status(400).json({ message: "Please enter a sales question" });
    if (question.length > 500) return res.status(400).json({ message: "Please keep your question under 500 characters" });

    const data = getSalesAssistantData(req.user.id);
    return res.json({ question, answer: answerSalesQuestion(question, data) });
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
    const returns = db.prepare("SELECT * FROM invoice_returns WHERE userId = ?").all(req.user.id);
    const returnItems = db.prepare(`
        SELECT iri.*, ir.invoiceId
        FROM invoice_return_items iri
        INNER JOIN invoice_returns ir ON ir.id = iri.returnId
        WHERE ir.userId = ?
    `).all(req.user.id);

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

    const returnsMap = {};
    returns.forEach((invoiceReturn) => {
        returnsMap[invoiceReturn.invoiceId] = returnsMap[invoiceReturn.invoiceId] || [];
        returnsMap[invoiceReturn.invoiceId].push({
            ...invoiceReturn,
            items: returnItems.filter((item) => item.returnId === invoiceReturn.id),
        });
    });

    return res.json({
        message: "Invoices fetched successfully",
        invoices: invoices.map((invoice) => ({
            ...invoice,
            items: itemMap[invoice.id] || [],
            payments: paymentsMap[invoice.id] || [],
            returns: returnsMap[invoice.id] || [],
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
    const returns = db.prepare("SELECT * FROM invoice_returns WHERE invoiceId = ? AND userId = ?").all(req.params.id, req.user.id)
        .map((invoiceReturn) => ({
            ...invoiceReturn,
            items: db.prepare("SELECT * FROM invoice_return_items WHERE returnId = ?").all(invoiceReturn.id),
        }));

    return res.json({
        message: "Invoice fetched successfully",
        invoice: {
            ...invoice,
            items,
            payments,
            returns,
        },
    });
});

app.post("/api/billing/invoices/:id/returns", authenticateToken, (req, res) => {
    const { items } = req.body;
    const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND userId = ?").get(req.params.id, req.user.id);

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    if (!invoice.customerId) return res.status(400).json({ message: "Returns can only be credited to a saved customer" });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Select at least one item to return" });

    const invoiceItems = db.prepare("SELECT * FROM invoice_items WHERE invoiceId = ? AND userId = ?").all(invoice.id, req.user.id);
    const returnedRows = db.prepare(`
        SELECT iri.invoiceItemId, COALESCE(SUM(iri.quantity), 0) AS quantity
        FROM invoice_return_items iri
        INNER JOIN invoice_returns ir ON ir.id = iri.returnId
        WHERE ir.invoiceId = ? AND ir.userId = ?
        GROUP BY iri.invoiceItemId
    `).all(invoice.id, req.user.id);
    const alreadyReturned = Object.fromEntries(returnedRows.map((row) => [row.invoiceItemId, Number(row.quantity)]));
    const requestedQuantities = new Map();
    for (const requested of items) {
        const invoiceItemId = Number(requested.invoiceItemId);
        requestedQuantities.set(invoiceItemId, (requestedQuantities.get(invoiceItemId) || 0) + Number(requested.quantity));
    }
    const selectedItems = [];

    for (const [invoiceItemId, quantity] of requestedQuantities) {
        const invoiceItem = invoiceItems.find((item) => item.id === invoiceItemId);
        if (!invoiceItem || !Number.isInteger(quantity) || quantity <= 0) {
            return res.status(400).json({ message: "Each returned item and quantity must be valid" });
        }
        const remaining = Number(invoiceItem.quantity) - Number(alreadyReturned[invoiceItem.id] || 0);
        if (quantity > remaining) {
            return res.status(400).json({ message: `${invoiceItem.productName} can only be returned up to ${remaining} more item(s)` });
        }
        selectedItems.push({ invoiceItem, quantity, creditAmount: (Number(invoiceItem.lineTotal) / Number(invoiceItem.quantity)) * quantity });
    }

    const creditAmount = selectedItems.reduce((sum, item) => sum + item.creditAmount, 0);
    const transaction = db.transaction(() => {
        const result = db.prepare(`INSERT INTO invoice_returns (userId, invoiceId, customerId, creditAmount) VALUES (?, ?, ?, ?)`)
            .run(req.user.id, invoice.id, invoice.customerId, creditAmount);
        const returnId = Number(result.lastInsertRowid);
        const insertReturnItem = db.prepare(`INSERT INTO invoice_return_items (returnId, invoiceItemId, quantity, creditAmount) VALUES (?, ?, ?, ?)`);

        selectedItems.forEach(({ invoiceItem, quantity, creditAmount: itemCredit }) => {
            insertReturnItem.run(returnId, invoiceItem.id, quantity, itemCredit);
            if (invoiceItem.productId) {
                db.prepare("UPDATE products SET stock = stock + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?")
                    .run(quantity, invoiceItem.productId, req.user.id);
            }
        });
        db.prepare("UPDATE customers SET credit = credit + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?")
            .run(creditAmount, invoice.customerId, req.user.id);
        return returnId;
    });

    try {
        const returnId = transaction();
        const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND userId = ?").get(invoice.customerId, req.user.id);
        return res.status(201).json({
            message: `Return processed. ${formatCurrency(creditAmount)} added to customer credit.`,
            return: db.prepare("SELECT * FROM invoice_returns WHERE id = ?").get(returnId),
            customer: formatCustomer(customer),
        });
    } catch (error) {
        console.error("Return processing failed:", error);
        return res.status(400).json({ message: error.message || "Unable to process return" });
    }
});

app.post("/api/billing/invoices", authenticateToken, async (req, res) => {
    const { customer, customerId, items, payments } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "At least one item is required for billing" });
    }

    if (!Array.isArray(payments)) {
        return res.status(400).json({ message: "payments must be an array" });
    }

    const normalizedCustomerName = String((customer && customer.customerName) || "Walk-in Customer").trim() || "Walk-in Customer";
    const normalizedContactNumber = customer && customer.contactNumber ? String(customer.contactNumber).trim() : "";
    const normalizedEmail = customer && customer.email ? String(customer.email).trim() : "";
    const resolvedCustomerId = customerId ? Number(customerId) : null;

    if (resolvedCustomerId !== null && (!Number.isInteger(resolvedCustomerId) || resolvedCustomerId < 1)) {
        return res.status(400).json({ message: "customerId must be valid when provided" });
    }

    let customerRecord = null;
    if (resolvedCustomerId !== null) {
        customerRecord = db.prepare("SELECT id, credit FROM customers WHERE id = ? AND userId = ?").get(resolvedCustomerId, req.user.id);
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
            internalProductName: String(product?.internalProductName || "").trim(),
            internalReference: String(product?.internalReference || "").trim(),
            internalGstPercentage: product?.internalGstPercentage == null ? null : Number(product.internalGstPercentage),
        });
    }

    const total = subtotal + gstTotal - discountTotal;
    const paymentTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const creditUsed = Math.min(Number(customerRecord?.credit || 0), total);

    if (paymentTotal + creditUsed < total - 0.01) {
        return res.status(400).json({ message: "Payment total must cover the invoice amount" });
    }

    const status = paymentTotal + creditUsed >= total ? "paid" : "partial";
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
                lineTotal,
                internalProductName,
                internalReference,
                internalGstPercentage
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                item.lineTotal,
                item.internalProductName,
                item.internalReference,
                item.internalGstPercentage
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

        if (creditUsed > 0) {
            db.prepare(`
                UPDATE customers
                SET credit = credit - ?, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ? AND userId = ? AND credit >= ?
            `).run(creditUsed, resolvedCustomerId, req.user.id, creditUsed);
            insertPayment.run(req.user.id, invoiceId, "credit", creditUsed);
        }

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
    const { productName, productPrice, sellingPrice, stock, brand, supplierId, gstPercentage, productImages, discount, barcode, internalProductName, internalReference, internalGstPercentage } = req.body;

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
            internalProductName,
            internalReference,
            internalGstPercentage,
            barcode,
            stockStatus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        String(internalProductName || "").trim(),
        String(internalReference || "").trim(),
        internalGstPercentage === "" || internalGstPercentage == null ? null : parseNumericValue(internalGstPercentage),
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

    if (req.body.internalProductName !== undefined) {
        updates.push("internalProductName = ?");
        values.push(String(req.body.internalProductName || "").trim());
    }

    if (req.body.internalReference !== undefined) {
        updates.push("internalReference = ?");
        values.push(String(req.body.internalReference || "").trim());
    }

    if (req.body.internalGstPercentage !== undefined) {
        updates.push("internalGstPercentage = ?");
        values.push(req.body.internalGstPercentage === "" || req.body.internalGstPercentage == null ? null : parseNumericValue(req.body.internalGstPercentage));
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

function getTodayDateString() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function getTodaySalesSummary(userId) {
    const today = getTodayDateString();

    const summary = db.prepare(`
        SELECT
            COUNT(*) AS orders,
            COALESCE(SUM(total), 0) AS revenue
        FROM invoices
        WHERE userId = ?
          AND DATE(createdAt, 'localtime') = ?
    `).get(userId, today);

    const productsSold = db.prepare(`
        SELECT
            COALESCE(SUM(ii.quantity), 0) AS productsSold
        FROM invoice_items ii
        INNER JOIN invoices i ON i.id = ii.invoiceId
        WHERE ii.userId = ?
          AND DATE(i.createdAt, 'localtime') = ?
    `).get(userId, today);

    const customers = db.prepare(`
        SELECT COUNT(DISTINCT
            CASE
                WHEN customerId IS NOT NULL THEN customerId
                ELSE 'walkin-' || id
            END
        ) AS customers
        FROM invoices
        WHERE userId = ?
          AND DATE(createdAt, 'localtime') = ?
    `).get(userId, today);

    const invoices = db.prepare(`
        SELECT
            i.id,
            i.invoiceNumber,
            i.customerName,
            i.contactNumber,
            i.subtotal,
            i.gstTotal,
            i.discountTotal,
            i.total,
            i.status,
            i.createdAt
        FROM invoices i
        WHERE i.userId = ?
          AND DATE(i.createdAt, 'localtime') = ?
        ORDER BY i.createdAt ASC
    `).all(userId, today);

    const invoiceItems = db.prepare(`
        SELECT
            invoiceId,
            productName,
            sku,
            quantity,
            unitPrice,
            gstPercent,
            discountPercent,
            lineTotal
        FROM invoice_items
        WHERE userId = ?
          AND invoiceId IN (
              SELECT id
              FROM invoices
              WHERE userId = ?
                AND DATE(createdAt, 'localtime') = ?
          )
        ORDER BY invoiceId ASC
    `).all(userId, userId, today);

    const itemsMap = {};

    invoiceItems.forEach((item) => {
        if (!itemsMap[item.invoiceId]) {
            itemsMap[item.invoiceId] = [];
        }

        itemsMap[item.invoiceId].push(item);
    });

    const orders = invoices.map((invoice) => ({
        ...invoice,
        items: itemsMap[invoice.id] || [],
    }));

    return {
        date: today,
        customers: Number(customers?.customers || 0),
        orders: Number(summary?.orders || 0),
        productsSold: Number(productsSold?.productsSold || 0),
        revenue: Number(summary?.revenue || 0),
        invoices: orders,
    };
}

app.post(
    "/api/reports/daily-summary/send",
    authenticateToken,
    async (req, res) => {
        try {
            const result =
                await sendDailySummaryEmail(
                    req.user.id
                );

            return res.json({
                message:
                    "Daily sales report sent successfully",
                ...result,
            });

        } catch (error) {

            console.error(
                "[Daily Summary] Email failed:",
                error
            );

            return res.status(500).json({
                message:
                    "Unable to send daily sales report",
                error: error.message,
            });
        }
    }
);

cron.schedule(
    "0 21 * * *",
    async () => {

        console.log(
            "[Daily Summary] Starting daily reports..."
        );

        try {

            const users = db.prepare(`
                SELECT
                    id,
                    email,
                    companyName
                FROM users
                WHERE email IS NOT NULL
                  AND email != ''
            `).all();

            for (const user of users) {

                try {

                    await sendDailySummaryEmail(
                        user.id
                    );

                } catch (error) {

                    console.error(
                        `[Daily Summary] Failed for ${user.email}:`,
                        error.message
                    );

                }

            }

            console.log(
                "[Daily Summary] All reports completed."
            );

        } catch (error) {

            console.error(
                "[Daily Summary] Scheduler failed:",
                error
            );

        }

    },
    {
        timezone: "Asia/Kolkata",
    }
);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Daily sales summary scheduled for 9:00 PM IST");
});
