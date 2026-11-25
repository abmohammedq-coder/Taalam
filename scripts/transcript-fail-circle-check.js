'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const sandbox = { window: {}, navigator: {}, document: {}, console, setTimeout, clearTimeout, fetch: async () => ({ json: async () => ({ supported: false }) }), Notification: { permission: 'default' }, atob: s => Buffer.from(s, 'base64').toString('binary'), Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} } };
vm.runInNewContext(fs.readFileSync(require.resolve('../public/tools.js'), 'utf8'), sandbox);
const t = {
  studentName: 'طالب اختبار', schoolName: 'مدرسة الاختبار', year: '2026-2027', hidden: false,
  subjects: ['الرياضيات'], columns: [
    { key: 'f1m', term: 'الفصل الأول', examType: 'المحصلة', label: 'الفصل الأول — المحصلة' },
    { key: 'f1e', term: 'الفصل الأول', examType: 'الاختبار', label: 'الفصل الأول — الاختبار' },
    { key: 'f2m', term: 'الفصل الثاني', examType: 'المحصلة', label: 'الفصل الثاني — المحصلة' },
    { key: 'f2e', term: 'الفصل الثاني', examType: 'الاختبار', label: 'الفصل الثاني — الاختبار' }
  ],
  rows: [{ subject: 'الرياضيات', cells: { f1m: { score: 20, max: 40 }, f1e: { score: 29, max: 60 }, f2m: { score: 20, max: 40 }, f2e: { score: 30, max: 60 } }, total: 99, max: 200, percent: 49.5 }],
  average: 49.5, gradeLabel: 'ضعيف / راسب', rank: 1, rankOutOf: 1
};
const html = sandbox.window.TOOLS.transcriptTable(t, false);
const termOne = html.match(/إجمالي الفصل الأول<\/th>/);
assert(termOne, 'first term total header is present');
assert(html.includes('border:2px solid #c62828'), 'failed term total has red circle');
assert(html.includes('إجمالي الفصل الثاني'), 'second term total header is present');
assert(html.includes('المجموع السنوي'), 'annual total is separately labeled');
// 49/100 must be circled, 50/100 must not; neither annual totals nor individual assessment marks are circled.
const belowHalf = sandbox.window.TOOLS.transcriptTable({ ...t, rows: [{ ...t.rows[0], cells: { f1m: { score: 20, max: 40 }, f1e: { score: 29, max: 60 }, f2m: { score: 20, max: 40 }, f2e: { score: 30, max: 60 } }, total: 99, max: 200 }] }, false);
const exactlyHalf = sandbox.window.TOOLS.transcriptTable({ ...t, rows: [{ ...t.rows[0], cells: { f1m: { score: 20, max: 40 }, f1e: { score: 30, max: 60 }, f2m: { score: 20, max: 40 }, f2e: { score: 30, max: 60 } }, total: 100, max: 200 }] }, false);
assert((belowHalf.match(/border:2px solid #c62828/g) || []).length === 1, '49/100 is circled once for the failed term');
assert((exactlyHalf.match(/border:2px solid #c62828/g) || []).length === 0, '50/100 is not circled');
console.log('PASS transcript table displays term totals and the 50% threshold without marking annual or component scores.');
