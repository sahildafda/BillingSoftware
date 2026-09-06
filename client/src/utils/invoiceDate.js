// SQLite CURRENT_TIMESTAMP values are UTC but omit the timezone suffix.
export function parseInvoiceDate(value) {
    const text = String(value || "").trim();
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(text)
        ? `${text.replace(" ", "T")}Z`
        : text;
    return new Date(normalized);
}

export function formatInvoiceDate(value, includeTime = false) {
    const date = parseInvoiceDate(value);
    if (Number.isNaN(date.getTime())) return "—";
    const options = { timeZone: "Asia/Kolkata" };
    return includeTime
        ? date.toLocaleString("en-IN", { ...options, hour12: true })
        : date.toLocaleDateString("en-IN", options);
}
