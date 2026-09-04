import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGstFilter, getReportRecords } from "./reportExport.js";

test("normalizeGstFilter accepts valid GST values", () => {
    assert.equal(normalizeGstFilter("all"), "all");
    assert.equal(normalizeGstFilter("gst"), "gst");
    assert.equal(normalizeGstFilter("non-gst"), "non-gst");
    assert.equal(normalizeGstFilter("random"), "all");
});

test("report records are filtered and limited correctly", () => {
    const invoices = [
        { id: 1, total: 1100, items: [{ lineTotal: 500, gstPercent: 5 }, { lineTotal: 600, gstPercent: 18 }] },
        { id: 2, total: 500, items: [{ lineTotal: 500, gstPercent: 0 }] },
        { id: 3, total: 1050, items: [{ lineTotal: 1050, internalGstPercentage: 18 }] },
    ];

    assert.equal(getReportRecords(invoices, "gst", "2").length, 2);
    assert.equal(getReportRecords(invoices, "non-gst", "all").length, 1);
    assert.equal(getReportRecords(invoices, "all", "1").length, 1);

    const firstOrder = getReportRecords(invoices, "all", "all")[0];
    assert.equal(firstOrder.orderAmount, 1100);
    assert.equal(firstOrder.taxFreeTotal, 0);
    assert.equal(firstOrder.gst5Total, 500);
    assert.equal(firstOrder.gst18Total, 600);

    const taxFreeOrder = getReportRecords(invoices, "non-gst", "all")[0];
    assert.equal(taxFreeOrder.taxFreeTotal, 500);
});
