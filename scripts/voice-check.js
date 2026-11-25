'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const student = fs.readFileSync(path.join(root, 'public', 'student.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const online = fs.readFileSync(path.join(root, 'public', 'online-learning.html'), 'utf8');
const studentSchool = fs.readFileSync(path.join(root, 'public', 'student-school.html'), 'utf8');
const sw = ['public/sw.js', 'public/admin/sw.js', 'public/school-admin/sw.js'].map(p => fs.readFileSync(path.join(root, p), 'utf8'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const checks = [
  ['cloud TTS status is checked on demand before fallback', /async function toCloud|const toCloud = async/.test(student) && student.includes('if (!CLOUD.checked || CLOUD.error) await refreshCloudStatus()')],
  ['concurrent status checks share one promise', student.includes('CLOUD.promise && !force') && student.includes("CLOUD.promise = api('/api/learn/status')")],
  ['device speech failure is remembered and auto-falls back', student.includes("P.deviceBad = true; save(); await toCloud(why)")],
  ['missing cloud voice gives server-configuration guidance, not Android settings', student.includes('الصوت السحابي غير مفعّل في إعدادات المنصة') && !student.includes('الإعدادات ← الإدارة العامة ← اللغة')],
  ['Gemini 3.8 WAV is not wrapped twice', server.includes("raw.subarray(0,4).toString('ascii')==='RIFF'") && server.includes("isWav?raw:pcmToWav(raw,rate)")],
  ['book quiz reads the full question before enabling answer controls for every student', /readQuestion\(\);/.test(student) && /disabled: true/.test(student) && student.includes('onEnd: enableAnswers')],
  ['online course quizzes read each question before enabling choices', online.includes('read();') && online.includes('radios.forEach(x=>x.disabled=false)') && online.includes('/api/learn/speak')],
  ['online course assignments require listening to instructions before writing an answer', online.includes('data-read-assignment') && online.includes('answer.disabled=true') && online.includes('speakArabic(f.dataset.assignmentPrompt')],
  ['school-post assignments require listening to instructions before submitting an answer', studentSchool.includes('data-read-assignment') && studentSchool.includes('answer.disabled=true') && studentSchool.includes('speakArabic(f.dataset.assignmentPrompt')],
  ['all app service workers use the new cache version', sw.every(x => x.includes(`VERSION = '${version}'`))]
];
let failed = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} voice checks passed.`);
process.exit(failed ? 1 : 0);
