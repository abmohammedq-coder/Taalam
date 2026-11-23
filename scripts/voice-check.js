'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const student = fs.readFileSync(path.join(root, 'public', 'student.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const sw = ['public/sw.js', 'public/admin/sw.js', 'public/school-admin/sw.js'].map(p => fs.readFileSync(path.join(root, p), 'utf8'));
const checks = [
  ['cloud TTS status is checked on demand before fallback', /async function toCloud|const toCloud = async/.test(student) && student.includes('if (!CLOUD.checked || CLOUD.error) await refreshCloudStatus()')],
  ['concurrent status checks share one promise', student.includes('CLOUD.promise && !force') && student.includes("CLOUD.promise = api('/api/learn/status')")],
  ['device speech failure is remembered and auto-falls back', student.includes("P.deviceBad = true; save(); await toCloud(why)")],
  ['missing cloud voice gives server-configuration guidance, not Android settings', student.includes('الصوت السحابي غير مفعّل في إعدادات المنصة') && !student.includes('الإعدادات ← الإدارة العامة ← اللغة')],
  ['Gemini 3.8 WAV is not wrapped twice', server.includes("raw.subarray(0,4).toString('ascii')==='RIFF'") && server.includes("isWav?raw:pcmToWav(raw,rate)")],
  ['all app service workers use the new cache version', sw.every(x => x.includes("VERSION = '2.95.6'"))]
];
let failed = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} voice checks passed.`);
process.exit(failed ? 1 : 0);
