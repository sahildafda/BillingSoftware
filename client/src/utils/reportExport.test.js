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
        { id: 1, gstTotal: 100, total: 1100, customerName: "A" },
        { id: 2, gstTotal: 0, total: 500, customerName: "B" },
        { id: 3, gstTotal: 50, total: 1050, customerName: "C" },
    ];

    assert.equal(getReportRecords(invoices, "gst", "2").length, 2);
    assert.equal(getReportRecords(invoices, "non-gst", "all").length, 1);
    assert.equal(getReportRecords(invoices, "all", "1").length, 1);
});
