const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const Database = require("better-sqlite3");

const app = express();
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || "billing-software-secret";
const db = new Database(path.join(__dirname, "database.sqlite"));

app.use(cors());
app.use(express.json());

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
        brand TEXT NOT NULL,
        gstPercentage REAL NOT NULL DEFAULT 0,
        productImages TEXT NOT NULL DEFAULT '[]',
        discount REAL NOT NULL DEFAULT 0,
        barcode TEXT,
        stockStatus TEXT NOT NULL DEFAULT 'out_of_stock',
        createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id)
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

function createBarcodeSvg(encryptedValue, details) {
    const productName = String(details.productName || "").trim();
    const sellingPrice = Number(details.sellingPrice || 0).toFixed(2);
    const discount = Number(details.discount || 0);
    const discountedLine = discount > 0 ? `Discount: ${discount}%` : "";

    const barcodeText = String(encryptedValue || "").replace(/[^A-Za-z0-9\-_.]/g, "");
    const lines = [productName ? `Product: ${productName}` : null, `Price: ₹${sellingPrice}`, discountedLine || null, `Code: ${barcodeText}`].filter(Boolean);
    const textWidth = Math.max(...lines.map((line) => line.length)) * 8;
    const width = Math.max(220, textWidth + 40);
    const height = 110;

    const bars = Array.from(barcodeText).map((char, index) => {
        const barWidth = 2 + ((char.charCodeAt(0) + index) % 4);
        return `<rect x="${index * 3 + 10}" y="${height - 40}" width="${barWidth}" height="30" fill="black"/>`;
    }).join("");

    const textElements = lines.map((line, index) => `        <text x="10" y="${20 + index * 16}" font-family="sans-serif" font-size="12">${line}</text>`).join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">\n  <rect width="100%" height="100%" fill="white"/>\n${textElements}\n  ${bars}\n</svg>`;
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

app.get("/", (req, res) => {
    res.send("Backend Running");
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

app.post("/api/products", authenticateToken, (req, res) => {
    const { productName, productPrice, sellingPrice, stock, brand, gstPercentage, productImages, discount, barcode } = req.body;

    if (!productName || productPrice === undefined || sellingPrice === undefined || stock === undefined || !brand || gstPercentage === undefined) {
        return res.status(400).json({ message: "Please provide productName, productPrice, sellingPrice, stock, brand, and gstPercentage" });
    }

    const parsedProductPrice = parseNumericValue(productPrice);
    const parsedSellingPrice = parseNumericValue(sellingPrice);
    const parsedStock = Number.isInteger(Number(stock)) ? Number(stock) : 0;
    const parsedGstPercentage = parseNumericValue(gstPercentage);
    const parsedDiscount = parseNumericValue(discount, 0);
    const imagesJson = serializeProductImages(productImages);
    const generatedBarcode = String(barcode || generateBarcode()).trim();
    const stockStatus = getStockStatus(parsedStock);

    const result = db.prepare(`
        INSERT INTO products (
            userId,
            productName,
            productPrice,
            sellingPrice,
            stock,
            brand,
            gstPercentage,
            productImages,
            discount,
            barcode,
            stockStatus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        req.user.id,
        String(productName).trim(),
        parsedProductPrice,
        parsedSellingPrice,
        parsedStock,
        String(brand).trim(),
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
        values.push(String(req.body.brand).trim());
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

    if (!product.barcode) {
        db.prepare("UPDATE products SET barcode = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?").run(barcode, req.params.id, req.user.id);
    }

    const encryptedBarcode = encryptBarcodeValue(barcode);
    const barcodeSvg = createBarcodeSvg(encryptedBarcode, {
        productName: product.productName,
        sellingPrice: product.sellingPrice,
        discount: product.discount,
    });

    return res.json({
        message: "Barcode generated successfully",
        barcode,
        encryptedBarcode,
        format: "CODE128",
        barcodeSvg,
        productId: Number(req.params.id),
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