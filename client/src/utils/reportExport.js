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

        if (invoiceItems.length === 0) {
            const gstAmount = Number(invoice.gstTotal || 0);
            const isIncluded =
                (normalizedFilter === "all") ||
                (normalizedFilter === "gst" && gstAmount > 0) ||
                (normalizedFilter === "non-gst" && gstAmount <= 0);

            if (!isIncluded) {
                return [];
            }

            return [{
                orderNumber: invoice.invoiceNumber || `INV-${invoice.id || "N/A"}`,
                orderDate: invoice.createdAt,
                customerName: invoice.customerName || "Walk-in Customer",
                contactNumber: invoice.contactNumber || "",
                email: invoice.email || "",
                productName: "Invoice Total",
                sku: "",
                quantity: 1,
                unitPrice: Number(invoice.total || 0),
                gstPercentage: Number(invoice.gstTotal || 0) > 0 ? 18 : 0,
                taxableValue: Number(invoice.subtotal || 0),
                gstAmount: Number(invoice.gstTotal || 0),
                totalAmount: Number(invoice.total || 0),
                gstType: Number(invoice.gstTotal || 0) > 0 ? "GST" : "Non-GST",
                status: invoice.status || "",
            }];
        }

        return invoiceItems
            .filter((item) => {
                const gstPercentage = Number(item.gstPercent ?? item.gst ?? 0);
                const includeRow =
                    (normalizedFilter === "all") ||
                    (normalizedFilter === "gst" && gstPercentage > 0) ||
                    (normalizedFilter === "non-gst" && gstPercentage <= 0);

                return includeRow;
            })
            .map((item) => {
                const quantity = Number(item.quantity || 1);
                const unitPrice = Number(item.unitPrice ?? item.price ?? 0);
                const gstPercentage = Number(item.gstPercent ?? item.gst ?? 0);
                const taxableValue = quantity * unitPrice;
                const gstAmount = taxableValue * (gstPercentage / 100);
                const totalAmount = taxableValue + gstAmount;

                return {
                    orderNumber: invoice.invoiceNumber || `INV-${invoice.id || "N/A"}`,
                    orderDate: invoice.createdAt,
                    customerName: invoice.customerName || "Walk-in Customer",
                    contactNumber: invoice.contactNumber || "",
                    email: invoice.email || "",
                    productName: item.productName || "Product",
                    sku: item.sku || item.barcode || "",
                    quantity,
                    unitPrice,
                    gstPercentage,
                    taxableValue,
                    gstAmount,
                    totalAmount,
                    gstType: gstPercentage > 0 ? "GST" : "Non-GST",
                    status: invoice.status || "",
                };
            });
    });

    const safeRows = Number.isFinite(parsedLimit) && parsedLimit > 0 ? orderRows.slice(0, parsedLimit) : orderRows;
    return safeRows;
}

export function getReportSummary(rows = []) {
    const totals = rows.reduce(
        (acc, row) => {
            acc.subtotal += Number(row.taxableValue || 0);
            acc.taxableValue += Number(row.taxableValue || 0);
            acc.gst += Number(row.gstAmount || 0);
            acc.total += Number(row.totalAmount || 0);
            return acc;
        },
        { subtotal: 0, taxableValue: 0, gst: 0, total: 0 }
    );

    return totals;
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
        "Customer",
        "Contact",
        "Email",
        "Product",
        "SKU",
        "Qty",
        "Unit Price",
        "GST %",
        "Taxable Value",
        "GST Amount",
        "Total Amount",
        "GST Type",
        "Status",
    ];

    const csvRows = [header.join(",")];

    rows.forEach((row) => {
        const values = [
            row.orderNumber || "",
            row.orderDate ? new Date(row.orderDate).toLocaleDateString("en-IN") : "",
            row.customerName || "Walk-in Customer",
            row.contactNumber || "",
            row.email || "",
            row.productName || "",
            row.sku || "",
            Number(row.quantity || 0),
            Number(row.unitPrice || 0),
            Number(row.gstPercentage || 0),
            Number(row.taxableValue || 0),
            Number(row.gstAmount || 0),
            Number(row.totalAmount || 0),
            row.gstType || "",
            row.status || "",
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
          <td>${row.customerName || "Walk-in Customer"}</td>
          <td>${row.productName || ""}</td>
          <td>${row.gstPercentage ?? 0}%</td>
          <td>${formatCurrency(row.unitPrice)}</td>
          <td>${formatCurrency(row.taxableValue)}</td>
          <td>${formatCurrency(row.gstAmount)}</td>
          <td>${formatCurrency(row.totalAmount)}</td>
          <td>${row.gstType || ""}</td>
        </tr>
      `)
        .join("");

    printWindow.document.write(`
    <html>
      <head>
        <title>${reportTitle}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; background: #f9fafb; margin: 32px; }
          .report-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
          .report-title { font-size: 28px; font-weight: 700; }
          .meta { color: #4b5563; font-size: 12px; }
          .summary { display: grid; grid-template-columns: repeat(3, minmax(150px, 1fr)); gap: 12px; margin: 16px 0 24px; }
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
          <div class="summary-box"><div class="summary-label">Taxable Value</div><div class="summary-value">${formatCurrency(summary.taxableValue)}</div></div>
          <div class="summary-box"><div class="summary-label">GST</div><div class="summary-value">${formatCurrency(summary.gst)}</div></div>
          <div class="summary-box"><div class="summary-label">Total</div><div class="summary-value">${formatCurrency(summary.total)}</div></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Product</th>
              <th>GST %</th>
              <th>Price</th>
              <th>Taxable Value</th>
              <th>GST Amount</th>
              <th>Total</th>
              <th>Type</th>
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
    printWindow.focus();
    printWindow.print();
}
