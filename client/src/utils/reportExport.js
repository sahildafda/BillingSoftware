import { formatInvoiceDate } from "./invoiceDate.js";

export function normalizeGstFilter(value) {
    const safeValue = String(value || "all").trim().toLowerCase();

    if (safeValue === "gst" || safeValue === "non-gst" || safeValue === "all") {
        return safeValue;
    }

    return "all";
}

export function getReportRecords(invoices = [], gstFilter = "all", recordLimit = "all") {
    const normalizedFilter = normalizeGstFilter(gstFilter);
    const parsedLimit = recordLimit === "all" ? Number.MAX_SAFE_INTEGER : Number(recordLimit || 0);

    const orderRows = (invoices || []).flatMap((invoice) => {
        const invoiceItems = Array.isArray(invoice.items) && invoice.items.length > 0 ? invoice.items : [];
        const hasGstProducts = invoiceItems.some((item) => Number(item.internalGstPercentage ?? item.gstPercent ?? item.gst ?? 0) > 0);
        const isIncluded = normalizedFilter === "all" ||
            (normalizedFilter === "gst" && hasGstProducts) ||
            (normalizedFilter === "non-gst" && !hasGstProducts);

        if (!isIncluded) return [];

        const productTotals = invoiceItems.reduce((totals, item) => {
            const gstPercentage = Number(item.internalGstPercentage ?? item.gstPercent ?? item.gst ?? 0);
            const productAmount = Number(item.lineTotal ?? (Number(item.quantity || 1) * Number(item.unitPrice ?? item.price ?? 0)));
            if (gstPercentage === 0) totals.taxFreeTotal += productAmount;
            if (gstPercentage === 5) totals.gst5Total += productAmount;
            if (gstPercentage === 18) totals.gst18Total += productAmount;
            return totals;
        }, { taxFreeTotal: 0, gst5Total: 0, gst18Total: 0 });

        return [{
            orderNumber: invoice.invoiceNumber || `INV-${invoice.id || "N/A"}`,
            orderDate: invoice.createdAt,
            orderAmount: Number(invoice.total || 0),
            ...productTotals,
        }];
    });

    const safeRows = Number.isFinite(parsedLimit) && parsedLimit > 0 ? orderRows.slice(0, parsedLimit) : orderRows;
    return safeRows;
}

export function getReportSummary(rows = []) {
    return rows.reduce((acc, row) => {
        acc.total += Number(row.orderAmount || 0);
        acc.taxFreeTotal += Number(row.taxFreeTotal || 0);
        acc.gst5Total += Number(row.gst5Total || 0);
        acc.gst18Total += Number(row.gst18Total || 0);
        return acc;
    }, { total: 0, taxFreeTotal: 0, gst5Total: 0, gst18Total: 0 });
}

export function formatCurrency(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function downloadExcelFile(rows, fileName = "invoice-report.xlsx") {
    const header = [
        "Order No",
        "Date",
        "Order Amount",
        "Tax Free Product Total",
        "5% GST Product Total",
        "18% GST Product Total",
    ];

    const csvRows = [header.join(",")];

    rows.forEach((row) => {

        const values = [
            row.orderNumber || "",
            row.orderDate ? formatInvoiceDate(row.orderDate) : "",
            Number(row.orderAmount || 0),
            Number(row.taxFreeTotal || 0),
            Number(row.gst5Total || 0),
            Number(row.gst18Total || 0),
        ];

        csvRows.push(values.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function printProfessionalReport(rows, reportTitle = "GST Report") {
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
        return;
    }

    const summary = getReportSummary(rows);
    const rowsMarkup = rows
        .map((row) => `
        <tr>
          <td>${row.orderNumber || ""}</td>
          <td>${row.orderDate ? formatInvoiceDate(row.orderDate) : ""}</td>
          <td>${formatCurrency(row.orderAmount)}</td>
          <td>${formatCurrency(row.taxFreeTotal)}</td>
          <td>${formatCurrency(row.gst5Total)}</td>
          <td>${formatCurrency(row.gst18Total)}</td>
        </tr>
      `)
        .join("");

    let printStarted = false;
    const startPrint = () => {
        if (printStarted || printWindow.closed) return;
        printStarted = true;
        printWindow.focus();
        printWindow.print();
    };

    printWindow.addEventListener("load", startPrint, { once: true });
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });

    printWindow.document.write(`
    <html>
      <head>
        <title>${reportTitle}</title>
        <style>
          @page { size: landscape; margin: 10mm; }
          html, body { margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; color: #111827; background: white; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; page-break-inside: avoid; }
          .report-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
          .report-title { font-size: 28px; font-weight: 700; }
          .meta { color: #4b5563; font-size: 12px; }
          .summary { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 12px; margin: 16px 0 24px; }
          .summary-box { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; }
          .summary-label { color: #6b7280; font-size: 12px; text-transform: uppercase; }
          .summary-value { font-size: 18px; font-weight: 700; margin-top: 6px; }
          table { width: 100%; border-collapse: collapse; background: white; }
          th, td { border: 1px solid #e5e7eb; padding: 10px 8px; font-size: 12px; text-align: left; }
          th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div>
            <div class="report-title">${reportTitle}</div>
            <div class="meta">Generated on ${new Date().toLocaleString("en-IN")}</div>
          </div>
          <div class="meta">Total Records: ${rows.length}</div>
        </div>

        <div class="summary">
          <div class="summary-box"><div class="summary-label">Order Amount</div><div class="summary-value">${formatCurrency(summary.total)}</div></div>
          <div class="summary-box"><div class="summary-label">Tax Free Products</div><div class="summary-value">${formatCurrency(summary.taxFreeTotal)}</div></div>
          <div class="summary-box"><div class="summary-label">5% GST Products</div><div class="summary-value">${formatCurrency(summary.gst5Total)}</div></div>
          <div class="summary-box"><div class="summary-label">18% GST Products</div><div class="summary-value">${formatCurrency(summary.gst18Total)}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Order Amount</th>
              <th>Tax Free Product Total</th>
              <th>5% GST Product Total</th>
              <th>18% GST Product Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsMarkup}
          </tbody>
        </table>
      </body>
    </html>
  `);

    printWindow.document.close();

    // Some embedded browsers do not dispatch load for document.write windows.
    window.setTimeout(startPrint, 300);
}
