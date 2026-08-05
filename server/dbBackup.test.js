const test = require('node:test');
const assert = require('node:assert/strict');

const { getNextBackupDelay, resolveBackupHour, buildBackupFilename } = require('./dbBackup');

test('resolveBackupHour clamps invalid values', () => {
    assert.equal(resolveBackupHour(''), 6);
    assert.equal(resolveBackupHour('30'), 6);
    assert.equal(resolveBackupHour('13'), 13);
});

test('next backup delay is computed for a future time', () => {
    const now = new Date(2026, 7, 5, 5, 0, 0);
});
