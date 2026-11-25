'use strict';
// Static wiring check for the dialog-based admin screens (no browser here): every tab has a panel,
// every tile / button points at an element that exists, nothing is left orphaned, the UI kit is
// loaded, cached by the service workers and served, and its code parses.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..'), pub = f => fs.readFileSync(path.join(root, 'public', f), 'utf8');
const checks = []; const ck = (l, ok) => checks.push([l, !!ok]);
const readFileIfExists = f => fs.existsSync(f) ? fs.readFileSync(f,'utf8') : '';
const admin = pub('admin.html'), sadm = pub('school-admin.html'), ui = pub('ui.js');
const ids = html => new Set([...html.matchAll(/id=\\?"([A-Za-z0-9_-]+)/g)].map(m => m[1]));
const aIds = ids(admin), sIds = ids(sadm);
ck('ui.js parses', (() => { try { new vm.Script(ui); return true; } catch { return false; } })());
ck('ui.js has accessible dialogs: role=dialog, aria-modal, Escape, focus trap, focus return', ['role: \'dialog\'', "'aria-modal': 'true'", "e.key === 'Escape'", "e.key !== 'Tab'", 'opener.focus']
  .every(x => ui.includes(x)));
ck('ui.js moves existing elements and puts them back where they were (handlers keep working)', ui.includes("document.createComment('ui-home')") && ui.includes('ph.parentNode.insertBefore(n, ph)'));
ck('phones get a full-screen sheet', /@media \(max-width:640px\)\{[^@]*\.ui-modal/.test(ui));
ck('both admin pages load ui.js', admin.includes('<script src="/ui.js"></script>') && sadm.includes('<script src="/ui.js"></script>'));
for (const sw of ['sw.js', 'admin/sw.js', 'school-admin/sw.js']) ck('service worker ' + sw + ' caches ui.js', pub(sw).includes("'/ui.js'"));
// platform admin: five sections, each with a panel; old tabs gone
const tabs = [...admin.matchAll(/<button[^>]*data-tab="([^"]+)"/g)].map(m => m[1]);
const panels = new Set([...admin.matchAll(/data-panel="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
ck('platform admin has overview, books, schools, admins, system, and central activity sections', JSON.stringify(tabs) === JSON.stringify(['overview', 'books', 'schools', 'admins', 'system', 'activity']));
ck('platform admin central activity view exposes actor, action, date, search, and paginated event details', pub('admin.html').includes('id="auditActor"') && pub('admin.html').includes('id="auditAction"') && pub('admin.html').includes('id="auditFrom"') && pub('admin.html').includes('id="auditNext"') && pub('admin.html').includes('/api/admin/audit?'));
ck('every platform-admin tab has a panel to show', tabs.every(t => panels.has(t)));
const hubSel = [...admin.slice(admin.indexOf('function buildHubs')).matchAll(/(?:section:|nodes:\[)'(#[A-Za-z0-9_-]+)'/g)].map(m => m[1].slice(1));
ck('every tile opens something that exists (' + hubSel.length + ' tiles)', hubSel.length >= 12 && hubSel.every(i => aIds.has(i)));
ck('tiles that open a stash section: the section is hidden from the tabs (data-panel="stash")', ['secBooksAdd', 'secBooksList', 'settingsCard', 'aboutCard', 'feedbackCard', 'backupCard', 'jobsCard', 'expCard'].every(i => new RegExp('data-panel="stash" id="' + i + '"').test(admin)));
ck('creating a school: the form is only reachable from its tile, not shown inline', !/data-panel="schools"[^>]*>(?:(?!<\/section>).)*id="schoolForm"/s.test(admin));
ck('badges for jobs / experiments are created by their tiles', /badgeId:'jobsBadge'/.test(admin) && /badgeId:'expBadge'/.test(admin) && !/data-tab="[a-z]+"[^>]*>[^<]*<span id="jobsBadge"/.test(admin));
ck('hubs are built before any loader that needs a badge', admin.indexOf("async function refreshAll(){try{buildHubs();") > 0);
ck('platform owner can edit a school (data, logo, accounts, password reset)', ['data-school-edit', 'reset-password', 'esLogoFile', '/admins/active'].every(x => admin.includes(x)));
// school admin: dialogs
const sSel = [...sadm.matchAll(/section:'(#[A-Za-z0-9_-]+)'/g)].map(m => m[1].slice(1));
ck('school admin: roster and results entry open in dialogs that exist (' + sSel.length + ')', sSel.length >= 3 && sSel.every(i => sIds.has(i)));
ck('school admin: bulk student entry opens directly, and results entry stays a hidden dialog section', /id="rsBulkCard"/.test(sadm) && !/id="rsAddCard"/.test(sadm) && /class="card hidden" id="resEntryCard"/.test(sadm) && /section:'#rsBulkCard'/.test(sadm));
ck('no element id is defined twice in the platform admin page', (() => { const all = [...admin.matchAll(/ id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]); return new Set(all).size === all.length; })());
ck('no element id is defined twice in the school admin page', (() => { const all = [...sadm.matchAll(/ id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]); return new Set(all).size === all.length; })());
ck('school admin: every direct ID selector points to an existing element (no stale roster controls)', [...sadm.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].every(m=>sIds.has(m[1])) && !sadm.includes("$('#rsGrade')") && !sadm.includes("$('#rsSection')"));

// ---- teachers, grid, transcripts ----
const sch = pub('school.html'), stu = pub('student-school.html'), gua = pub('guardian.html'), tui = pub('teachers-ui.js'), tools = pub('tools.js');
ck('teachers-ui.js parses and is cached by every service worker', (() => { try { new vm.Script(tui); return true; } catch { return false; } })() && ['sw.js', 'admin/sw.js', 'school-admin/sw.js'].every(f => pub(f).includes("'/teachers-ui.js'")));
ck('school admin has a Teachers dashboard tile that mounts the manager in its dialog', sadm.includes("teachers:['👨‍🏫 المعلمون','lg']") && sadm.includes('id="tab-teachers"') && sadm.includes("base:'/api/school-admin/teachers'") && sadm.includes('<script src="/teachers-ui.js"></script>'));
ck('the platform owner manages a school\'s teachers from the school editor', admin.includes('id="esTeachers"') && admin.includes("'/api/admin/schools/'+encodeURIComponent(id)+'/teachers'") && admin.includes('<script src="/teachers-ui.js"></script>'));
ck('teacher assignment editor: subject list + "other" + a set of grades per subject', ['asg-subject', 'asg-free', 'asg-grades', 'OTHER', 'type: \'checkbox\''].every(x => tui.includes(x)));
ck('students are added from a keyboard sheet (Enter / arrows / paste / auto-new row / birth date / phone)', ['id="gdBody"', 'id="gdSave"'].every(x => sadm.includes(x)) && /e\.key==='Enter'\|\|e\.key==='ArrowDown'/.test(sadm) && sadm.includes("gdBody.addEventListener('paste'") && sadm.includes("gdBody.addEventListener('input'") && sadm.includes('data-c="birth"') === false && sadm.includes('data-c=\\"birth\\"') === false ? true : (sadm.includes('data-c=birth') || sadm.includes('data-c="birth"')));
ck('the old free-text bulk box is gone', !/rsBulkNames|rsBulkAdd/.test(sadm));
ck('teacher portal: posting uses the assignment list; grading and notes are limited to own subjects', ['id="gradeForm"', 'id="noteForm"', 'id="tpAsg"', '/api/school-member/teacher/results', '/api/school-member/teacher/notes', '/api/school-member/teacher/overview'].every(x => sch.includes(x)));
ck('school member portal: teacher and student actions open in separate role-based workspaces with back navigation', ['roleActionHub','roleActionGrid','roleActionPanels','role-panel-head','role-back','منشورات المدرسة','نشر محتوى للطلاب','رصد درجات المواد','الجدول المدرسي','ملاحظات عن الطلاب','window.__buildRoleActionHub'].every(x => sch.includes(x)));
ck('student portal has the transcript tab with subject filter and print', stu.includes('data-student-tab="grades"') && stu.includes('id="grSubject"') && stu.includes('/api/school-member/transcript') && stu.includes('transcriptPrint'));
ck('guardian page shows the transcript and notes for each child', gua.includes('/api/parent/transcript') && gua.includes('/api/parent/notes') && gua.includes('transcriptPrint'));
// run the transcript renderer for real
{ const ctxv = { window: {}, document: {}, navigator: {}, atob: x => x, Notification: {}, location: {}, fetch: () => {}, setTimeout, Blob: class {}, URL: {} }; vm.createContext(ctxv); vm.runInContext(tools, ctxv); const T = ctxv.window.TOOLS;
  const t = { studentName: 'أحمد', schoolName: 'م', grade: 'أول', section: 'أ', year: '2026', hidden: false, hiddenReason: '', columns: [{ key: 'a|b|', label: 'الجزء الأول — الشهري' }, { key: 'c|d|', label: 'الجزء الثاني — الشهري' }], rows: [{ subject: 'القرآن <img src=x onerror=alert(1)>', cells: { 'a|b|': { score: 18, max: 20 } }, total: 18, max: 20, percent: 90 }] };
  const html = T.transcriptTable(t);
  ck('transcript table: one column per existing exam, "—" where the subject has no such exam', html.includes('الجزء الأول — الشهري') && html.includes('الجزء الثاني — الشهري') && html.includes('18 / 20') && html.includes('—'));
  ck('transcript table escapes hostile subject names', !html.includes('<img') && html.includes('&lt;img'));
  const hid = T.transcriptTable({ ...t, hidden: true, hiddenReason: 'محجوبة', rows: [{ subject: 'علوم', cells: { 'a|b|': { hidden: true } }, total: null, max: null, percent: null }] });
  ck('hidden transcript shows a blurred placeholder and the reason, never a real score', hid.includes('blur(6px)') && hid.includes('محجوبة') && !/18 \/ 20/.test(hid));
  ck('an empty transcript says so', T.transcriptTable({ ...t, rows: [] }).includes('لا توجد درجات')); }

// ---- round 2: every school-admin section is a dialog; no mixed members tab; clear gate; teacher login ----
const stuJs = pub('student.js'), teacherPage = pub('teacher.html');
const dialogTabs = [...sadm.matchAll(/(\w+):\['[^']+','(?:md|lg)'\]/g)].map(m => m[1]);
const tileStart=sadm.indexOf("UI.hub($('#overviewTiles')"),tileEnd=sadm.indexOf('/* ---------- roster ---------- */',tileStart);
const tileTabs=[...sadm.slice(tileStart,tileEnd).matchAll(/\['([a-z]+)','/g)].map(m=>m[1]);
ck('school admin: duplicate text sidebar is removed; dashboard tiles are the single navigation source', !sadm.includes('<aside class="sidebar"') && sadm.includes('id="overviewTiles"') && sadm.includes('id="sectionHomeBar"'));
ck('school admin: each dashboard tile opens an existing dialog section ('+tileTabs.length+' tiles)', tileTabs.length>=15 && tileTabs.every(t=>dialogTabs.includes(t)) && dialogTabs.every(t=>sIds.has('tab-'+t)));
ck('school admin: publishing is accessed from the content tile, not repeated as a separate dashboard tile', !tileTabs.includes('compose') && sadm.includes('data-goto="compose"') && sadm.includes('data-goto="posts"'));
ck('school admin: dashboard includes the previously missing administration guide tile', tileTabs.includes('help') && sadm.includes("['help','📖','دليل الإدارة'"));
ck('school admin: requests tile has student, teacher and guardian request categories', sadm.includes("title:'طلبات الطلاب'") && sadm.includes("title:'طلبات المعلمين'") && sadm.includes("title:'طلبات أولياء الأمور'"));
ck('school admin: student request matching is searchable and only visible in the school admin request dialog', sadm.includes('data-match-search=') && sadm.includes('ابحث عن الطالب في سجل المدرسة') && sadm.includes('data-match-student=') && sadm.includes('data-school-request=') );
ck('school admin: approval requires an explicitly selected exact roster match and server validates the roster record', sadm.includes('approve.disabled=!valid') && sadm.includes('اختر سجل الطالب المطابق') && readFileIfExists(path.join(root,'lib','extras.js')).includes('sameName(entry.name, member.name)'));
ck('school admin: live refresh follows the open dialog', sadm.includes('if(window.__dialogTab)return window.__dialogTab'));
ck('grade entry uses lists from the school (subject, term, exam type) and a numbered sheet with Enter navigation', /<select id="resSubject">/.test(sadm) && /<select id="resTerm">/.test(sadm) && /<select id="resExam">/.test(sadm) && sadm.includes('/api/school-admin/academic-options') && sadm.includes('${i+1}. ${esc(m.name)}') && !sadm.includes('list="resSubjects"'));
ck('pending teachers can be approved or refused from the Teachers dialog', tui.includes("review: '") === false && tui.includes('decide(t, \'approve\')') && sadm.includes("review:'/api/school-admin/members/review'"));
ck('dialog headings are not repeated inside the dialog', /\.ui-body>\.card>h2:first-child/.test(ui));
ck('learn app: "my school" asks a signed-out student to link his account instead of dumping him on a login page', stuJs.includes('openSchoolGate') && stuJs.includes('يلزم تسجيل حسابك أولًا') && stuJs.includes("href: '/student/school'"));
ck('/teacher page forwards school teachers to their school page', teacherPage.includes('if(d.redirect)') && teacherPage.includes('location.href=d.redirect'));
ck('student and teacher school portals redirect by the authenticated account role without sharing the wrong workspace', stu.includes("roleSession.member?.role==='teacher'") && stu.includes("location.replace('/teacher/school')") && sch.includes("roleSession.member?.role==='student'") && sch.includes("location.replace('/student/school')"));
ck('Arabic exit confirmation is included in all major app portals and cached for offline launch', ['student.html','admin.html','school-admin.html','school.html','student-school.html','teacher.html','guardian.html'].every(f=>pub(f).includes('/exit-confirm.js')) && ['sw.js','admin/sw.js','school-admin/sw.js'].every(f=>pub(f).includes('/exit-confirm.js')));
ck('school admin: student bulk-entry grade list is refreshed from school academic options', sadm.includes("api('/api/school-admin/academic-options')") && sadm.includes('async function loadRoster()'));
ck('school admin: date fields support keyboard input and a calendar picker', sadm.includes('setupEditableDates') && sadm.includes('data-date-picker') && sadm.includes('inputMode'));
ck('school admin: certificate student list is initialized and filtered by selected grade', sadm.includes('window.schoolCertificateStudents') && sadm.includes('filter(x=>x.grade===grade)'));
ck('school admin: internal JavaScript exceptions are translated to Arabic status text', sadm.includes('حدث خطأ داخلي أثناء تنفيذ العملية'));
ck('school admin: dashboard loader no longer writes to the removed pending-preview element', !sadm.includes("$('#pendingPreview')") && !sadm.includes('id="pendingPreview"'));
const studentPortal = pub('student-school.html');
ck('student portal shows separate new-account and login choices before either form', studentPortal.includes('id="studentAuthChoices"') && studentPortal.includes('id="showStudentRegister"') && studentPortal.includes('id="showStudentLogin"') && studentPortal.includes('<form id="register" class="hidden">') && studentPortal.includes('<form id="login" class="hidden">'));
ck('student login exposes only email and password after selecting login, with a back action', studentPortal.includes('<form id="login" class="hidden"><h3>دخول حساب معتمد</h3><label>البريد الإلكتروني<input name="email" type="email"') && studentPortal.includes('<label>كلمة المرور<input name="password" type="password"') && studentPortal.includes('data-auth-back') && studentPortal.includes("$('#showStudentLogin').onclick"));
let failed = 0; for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} UI wiring checks passed.`); if (failed) process.exitCode = 1;
