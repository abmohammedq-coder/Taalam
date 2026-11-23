'use strict';
// Batch C check (real server): teachers with subject+grade assignments, grading limited to the
// teacher's own subjects, transcripts for students and guardians (columns appear only for exams that
// exist, fee-based hiding), notes/complaints with the right audiences, platform-owner control,
// birth dates in the roster, and permission boundaries.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..'), wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'taallam-acad-')), modules = path.join(temp, 'modules', 'pdf-parse'); fs.mkdirSync(modules, { recursive: true });
  fs.writeFileSync(path.join(modules, 'index.js'), 'module.exports=async()=>({text:"x",numpages:1})');
  const dataDir = path.join(temp, 'data'); fs.mkdirSync(dataDir);
  const port = 33000 + Math.floor(Math.random() * 20000), origin = 'http://127.0.0.1:' + port;
  const child = spawn(process.execPath, [path.join(root, 'server.js')], { env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: path.join(temp, 'modules'), ADMIN_EMAIL: 'owner@example.invalid', ADMIN_PASSWORD: 'Owner-Password-For-Academics-123', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  const checks = []; const ck = (l, ok) => checks.push([l, !!ok]);
  const request = (method, url, o = {}) => new Promise((resolve, reject) => { const headers = { Origin: origin }; if (o.cookie) headers.Cookie = o.cookie; let payload; if (o.body !== undefined) { payload = JSON.stringify(o.body); headers['Content-Type'] = 'application/json'; } const req = http.request({ hostname: '127.0.0.1', port, path: url, method, headers }, res => { const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(ch).toString('utf8')); } catch { /* */ } resolve({ status: res.statusCode, json, headers: res.headers }); }); }); req.on('error', reject); if (payload) req.write(payload); req.end(); });
  const ck0 = r => String(r.headers['set-cookie'] || '').split(';')[0];
  const G1 = 'الأول الأساسي', G2 = 'الثاني الأساسي', QURAN = 'القرآن الكريم', MATH = 'الرياضيات';
  try {
    for (let i = 0; i < 80; i++) { if (child.exitCode !== null) throw new Error('server exited: ' + log); try { if ((await request('GET', '/api/teacher/status')).status === 200) break; } catch { /* starting */ } await wait(150); }
    const ac = ck0(await request('POST', '/api/admin/login', { body: { email: 'owner@example.invalid', password: 'Owner-Password-For-Academics-123' } }));
    await request('POST', '/api/admin/schools', { cookie: ac, body: { name: 'مدرسة الكشوف', adminName: 'المدير', adminEmail: 'head@example.invalid', adminPassword: 'Head-Password-123', deputyName: 'الوكيل', deputyEmail: 'dep@example.invalid', deputyPassword: 'Deputy-Password-123', grades: [G1, G2], schoolYear: '2026-2027' } });
    const sid = (await request('GET', '/api/admin/schools', { cookie: ac })).json.schools[0].id;
    const sac = ck0(await request('POST', '/api/school-admin/login', { body: { email: 'head@example.invalid', password: 'Head-Password-123' } }));
    const dac = ck0(await request('POST', '/api/school-admin/login', { body: { email: 'dep@example.invalid', password: 'Deputy-Password-123' } }));

    // ---------- roster with birth dates ----------
    const bulk = await request('POST', '/api/school-admin/roster/bulk', { cookie: sac, body: { grade: G1, section: 'أ', rows: [{ name: 'أحمد علي محمد', birthDate: '2018-05-10' }, { name: 'سارة خالد أحمد', birthDate: '2099-01-01' }, { name: 'عمر يوسف حسن' }, { name: 'أحمد علي محمد' }] } });
    await request('POST', '/api/school-admin/roster/bulk', { cookie: sac, body: { grade: G2, section: 'ب', rows: [{ name: 'ليلى حسن ناصر', birthDate: '2017-03-01' }] } });
    const roster = (await request('GET', '/api/school-admin/roster', { cookie: sac })).json.students, R = n => roster.find(x => x.name === n);
    ck('grid rows are added with birth date; duplicate rows inside the same submission are skipped', bulk.json.added === 3 && bulk.json.skipped === 1 && R('أحمد علي محمد').birthDate === '2018-05-10');
    ck('an impossible or future birth date is dropped, not stored', R('سارة خالد أحمد').birthDate === '' && R('عمر يوسف حسن').birthDate === '');
    ck('birth date can be edited', (await request('PATCH', '/api/school-admin/roster/' + R('عمر يوسف حسن').id, { cookie: sac, body: { birthDate: '2018-12-31' } })).json.student.birthDate === '2018-12-31');

    // ---------- student account linking requests: school-side match, approve and reject ----------
    const studentReq1 = await request('POST', '/api/student/register', { body: { schoolId: sid, name: 'ليلى حسن ناصر', email: 'layla.link@example.invalid', password: 'Student-Link-Password-1', grade: G2, section: 'ب' } });
    const pending1 = (await request('GET', '/api/school-admin/members', { cookie: sac })).json.members.find(m => m.email === 'layla.link@example.invalid');
    ck('student registration creates a pending request without exposing roster choices to the student', studentReq1.status === 201 && !!pending1 && pending1.status === 'pending' && !Object.prototype.hasOwnProperty.call(studentReq1.json || {}, 'students'));
    const approveLink = await request('POST', '/api/school-admin/members/review', { cookie: sac, body: { id: pending1?.id, action: 'approve', rosterId: R('ليلى حسن ناصر')?.id } });
    ck('school admin matches and approves the pending student request against the existing roster record', approveLink.status === 200 && approveLink.json.status === 'approved' && (await request('GET', '/api/school-admin/members', { cookie: sac })).json.members.find(m => m.id === pending1.id)?.rosterId === R('ليلى حسن ناصر').id);
    const studentReq2 = await request('POST', '/api/student/register', { body: { schoolId: sid, name: 'ليلى حسن ناصر', email: 'layla.reject@example.invalid', password: 'Student-Reject-Password-1', grade: G2, section: 'ب' } });
    const pending2 = (await request('GET', '/api/school-admin/members', { cookie: sac })).json.members.find(m => m.email === 'layla.reject@example.invalid');
    const rejectLink = await request('POST', '/api/school-admin/members/review', { cookie: sac, body: { id: pending2?.id, action: 'reject' } });
    ck('school admin can reject a pending student request without requiring a roster selection', studentReq2.status === 201 && rejectLink.status === 200 && rejectLink.json.status === 'rejected' && (await request('GET', '/api/school-admin/members', { cookie: sac })).json.members.find(m => m.id === pending2.id)?.status === 'rejected');
    const schoolUi = fs.readFileSync(path.join(root, 'public', 'school-admin.html'), 'utf8');
    ck('school request buttons parse the full request ID and action before sending the review request', schoolUi.includes("String(b.dataset.schoolRequest||'').split('|')") && !schoolUi.includes('const [id,action]=b.dataset.schoolRequest,'));
    ck('school result card uses the Yemen-style bordered result summary and all-subject report', schoolUi.includes('class="note"') && schoolUi.includes('اختر «كل المواد»') && schoolUi.includes('النتيجة النهائية للفصل الدراسي'));

    // ---------- teachers ----------
    const opts = (await request('GET', '/api/school-admin/academic-options', { cookie: sac })).json;
    ck('academic options: school grades, default subjects (Quran, math, behaviour…), exam types and terms', opts.grades.length === 2 && opts.subjects.includes(QURAN) && opts.subjects.includes('السلوك والمواظبة') && opts.terms.length === 2 && opts.examTypes.length >= 3);
    ck('grade entry uses the exact semester and assessment labels from the school result model', opts.terms[0] === 'الفصل الأول' && opts.terms[1] === 'الفصل الثاني' && ['المحصلة الأولى','الفصل الأول','المحصلة الثانية','الفصل الثاني'].every(x => opts.examTypes.includes(x)));
    const asg1 = [{ grade: G1, subject: QURAN }, { grade: G2, subject: MATH }], asg2 = [{ grade: G1, subject: MATH }];
    ck('adding a teacher needs a session', (await request('POST', '/api/school-admin/teachers', { body: {} })).status === 401);
    const t1 = await request('POST', '/api/school-admin/teachers', { cookie: sac, body: { name: 'الأستاذ عبدالله', email: 'abd@example.invalid', password: 'Teacher-Password-1', assignments: asg1 } });
    ck('the school admin adds a teacher with subjects per grade (approved at once)', t1.status === 201 && t1.json.teacher.active === true && t1.json.teacher.assignments.length === 2);
    const t2 = await request('POST', '/api/school-admin/teachers', { cookie: sac, body: { name: 'الأستاذة هدى', email: 'huda@example.invalid', password: 'Teacher-Password-2', assignments: asg2 } });
    ck('a second teacher for another subject', t2.status === 201);
    ck('duplicate e-mail, bad grade, no subject and weak password are refused', (await request('POST', '/api/school-admin/teachers', { cookie: sac, body: { name: 'x', email: 'abd@example.invalid', password: 'Teacher-Password-1', assignments: asg1 } })).status === 409 && (await request('POST', '/api/school-admin/teachers', { cookie: sac, body: { name: 'x', email: 'n1@example.invalid', password: 'Teacher-Password-1', assignments: [{ grade: 'صف غير موجود', subject: MATH }] } })).status === 400 && (await request('POST', '/api/school-admin/teachers', { cookie: sac, body: { name: 'x', email: 'n2@example.invalid', password: 'Teacher-Password-1', assignments: [] } })).status === 400 && (await request('POST', '/api/school-admin/teachers', { cookie: sac, body: { name: 'x', email: 'n3@example.invalid', password: '123', assignments: asg1 } })).status === 400);
    ck('a deputy without a delegation cannot add teachers', (await request('POST', '/api/school-admin/teachers', { cookie: dac, body: { name: 'x', email: 'n4@example.invalid', password: 'Teacher-Password-1', assignments: asg1 } })).status === 403);
    const tc1 = ck0(await request('POST', '/api/school-member/login', { body: { email: 'abd@example.invalid', password: 'Teacher-Password-1' } })), tc2 = ck0(await request('POST', '/api/school-member/login', { body: { email: 'huda@example.invalid', password: 'Teacher-Password-2' } }));
    ck('teachers log in right away with the password the admin set', !!tc1 && !!tc2);
    const viaTeacherPage = await request('POST', '/api/teacher/login', { body: { email: 'abd@example.invalid', password: 'Teacher-Password-1' } });
    ck('signing in from the /teacher page works for a school teacher (sent to the school page, already signed in)', viaTeacherPage.status === 200 && viaTeacherPage.json.redirect === '/teacher/school' && (await request('GET', '/api/school-member/me', { cookie: ck0(viaTeacherPage) })).json.member.role === 'teacher');
    ck('…a wrong password is still refused there', (await request('POST', '/api/teacher/login', { body: { email: 'abd@example.invalid', password: 'wrong-password-1' } })).status === 401 && (await request('POST', '/api/teacher/login', { body: { email: 'nobody@example.invalid', password: 'wrong-password-1' } })).status === 401);
    const ov = (await request('GET', '/api/school-member/teacher/overview', { cookie: tc1 })).json;
    ck('a teacher sees his assignments and only the students of his grades', ov.assignments.length === 2 && ov.students.length === 4 && ov.students.every(s => [G1, G2].includes(s.grade)));
    ck('teacher endpoints are closed to anonymous users and to school admins', (await request('GET', '/api/school-member/teacher/overview')).status === 401 && (await request('GET', '/api/school-member/teacher/overview', { cookie: sac })).status === 401);
    ck('a teacher cannot use the school-admin screens', (await request('GET', '/api/school-admin/results', { cookie: tc1 })).status === 401 && (await request('POST', '/api/school-admin/teachers', { cookie: tc1, body: {} })).status === 401);

    // ---------- grading limited to own subject ----------
    const rowsG1 = [R('أحمد علي محمد'), R('سارة خالد أحمد'), R('عمر يوسف حسن')].map((s, i) => ({ studentId: s.id, score: [18, 15, 20][i] }));
    const post = (cookie, body) => request('POST', '/api/school-member/teacher/results', { cookie, body });
    const base = { grade: G1, subject: QURAN, examType: 'الاختبار الشهري', term: 'الجزء الأول', max: 20 };
    const g1 = await post(tc1, { ...base, rows: rowsG1 });
    ck('a teacher records grades for his own subject and grade', g1.status === 201 && g1.json.added === 3);
    ck('duplicate assessment for the same student is rejected', (await post(tc1, { ...base, rows: [rowsG1[0]] })).status === 409);
    const firstResult = (await request('GET', '/api/school-member/teacher/results?grade=' + encodeURIComponent(G1) + '&subject=' + encodeURIComponent(QURAN), { cookie: tc1 })).json.results.find(r => r.studentId === rowsG1[0].studentId);
    ck('teacher can edit an existing grade without creating a duplicate', (await request('PATCH', '/api/school-member/teacher/results/' + firstResult.id, { cookie: tc1, body: { score: 19, max: 20 } })).status === 200);
    ck('…but not for a subject that is not his', (await post(tc1, { ...base, subject: MATH, rows: rowsG1 })).status === 403);
    ck('…nor for a grade he does not teach this subject in', (await post(tc1, { ...base, grade: G2, subject: QURAN, rows: [{ studentId: R('ليلى حسن ناصر').id, score: 10 }] })).status === 403);
    ck('…nor a score above the maximum, nor a student of another grade', (await post(tc1, { ...base, rows: [{ studentId: rowsG1[0].studentId, score: 99 }] })).status === 400 && (await post(tc1, { ...base, rows: [{ studentId: R('ليلى حسن ناصر').id, score: 5 }] })).status === 403);
    await post(tc1, { ...base, examType: 'الاختبار النصفي', max: 40, rows: rowsG1.map(r => ({ ...r, score: r.score * 2 - 1 })) });
    await post(tc1, { ...base, term: 'الجزء الثاني', rows: rowsG1.map(r => ({ ...r, score: 10 })) });
    const secondExam = await post(tc1, { ...base, term: 'الفصل الثاني', examType: 'الفصل الثاني', max: 30, rows: rowsG1.map(r => ({ ...r, score: 25 })) });
    ck('teacher can record the second-semester exam with the canonical label', secondExam.status === 201);
    await post(tc2, { grade: G1, subject: MATH, examType: 'الاختبار الشهري', term: 'الجزء الأول', max: 50, rows: rowsG1.map(r => ({ ...r, score: 40 })) });
    ck('the other teacher records his own subject', (await request('GET', '/api/school-member/teacher/results?grade=' + encodeURIComponent(G1) + '&subject=' + encodeURIComponent(MATH), { cookie: tc2 })).json.results.length === 3);
    const t1Math = await request('GET', '/api/school-member/teacher/results?grade=' + encodeURIComponent(G1) + '&subject=' + encodeURIComponent(MATH), { cookie: tc1 });
    ck('a teacher cannot read the grades of another subject', t1Math.status === 403);
    const t1Quran = (await request('GET', '/api/school-member/teacher/results?grade=' + encodeURIComponent(G1) + '&subject=' + encodeURIComponent(QURAN), { cookie: tc1 })).json.results;
    ck('his list contains only his subject', t1Quran.length === 12 && t1Quran.every(r => r.studentName));
    const mathId = (await request('GET', '/api/school-member/teacher/results?grade=' + encodeURIComponent(G1) + '&subject=' + encodeURIComponent(MATH), { cookie: tc2 })).json.results[0].id;
    ck('a teacher cannot delete a grade of another subject', (await request('DELETE', '/api/school-member/teacher/results/' + mathId, { cookie: tc1 })).status === 403);
    const own = t1Quran.find(r => r.studentId === R('عمر يوسف حسن').id).id; ck('a teacher can delete his own grade', (await request('DELETE', '/api/school-member/teacher/results/' + own, { cookie: tc1 })).status === 200);
    ck('the school admin sees every subject', (await request('GET', '/api/school-admin/results', { cookie: sac })).json.results.length === 8 + 3 + 3);
    // ---------- pivot report, schedule, attendance and immutable certificate snapshot ----------
    const pivot = await request('GET', '/api/school-admin/results/report?grade=' + encodeURIComponent(G1) + '&subject=' + encodeURIComponent(QURAN), { cookie: sac });
    ck('school report returns one row per student and dynamic assessment columns', pivot.status === 200 && pivot.json.rows.length === 3 && pivot.json.columns.length >= 2 && pivot.json.rows.every(x => x.studentId));
    const allSubjects = await request('GET', '/api/school-admin/results/report?grade=' + encodeURIComponent(G1) + '&subject=' + encodeURIComponent('كل المواد'), { cookie: sac });
    ck('school report supports all subjects with subject-labelled columns and one row per student', allSubjects.status === 200 && allSubjects.json.subject === 'كل المواد' && allSubjects.json.rows.length === 3 && allSubjects.json.columns.some(c => c.subject === 'القرآن') && allSubjects.json.columns.some(c => c.subject === MATH));
    ck('school report computes competition ranking and international-style grade bands', pivot.json.rows.every(x => Number.isInteger(x.rank) && ['A','B','C','D','E','F'].includes(x.gradeLetter) && x.gradeLabel));
    const firstTermReport = await request('GET', '/api/school-admin/results/report?grade=' + encodeURIComponent(G1) + '&subject=' + encodeURIComponent('كل المواد') + '&term=' + encodeURIComponent('الفصل الأول'), { cookie: sac });
    ck('first-semester report normalizes legacy labels to المحصلة الأولى and الفصل الأول', firstTermReport.status === 200 && firstTermReport.json.columns.some(c => c.examType === 'المحصلة الأولى') && firstTermReport.json.columns.some(c => c.examType === 'الفصل الأول') && firstTermReport.json.subjects.includes('القرآن'));
    const defaulted = await request('POST', '/api/school-admin/results', { cookie: sac, body: { studentId: R('ليلى حسن ناصر').id, subject: QURAN, examType: 'الاختبار الشهري', term: 'اختبار قياس إضافي', score: 12 } });
    ck('monthly assessment defaults to 20 points when maximum is omitted', defaulted.status === 201 && (await request('GET', '/api/school-admin/results?studentId=' + R('ليلى حسن ناصر').id, { cookie: sac })).json.results.some(x => x.examType === 'الاختبار الشهري' && x.score === 12 && x.max === 20));
    ck('school admin cannot accidentally record the same assessment twice', (await request('POST', '/api/school-admin/results', { cookie: sac, body: { studentId: R('ليلى حسن ناصر').id, subject: QURAN, examType: 'الاختبار الشهري', term: 'اختبار قياس إضافي', score: 13, max: 20 } })).status === 409);
    const partOne = await request('POST', '/api/school-admin/results', { cookie: sac, body: { studentId: R('ليلى حسن ناصر').id, subject: QURAN, examType: 'الاختبار الشهري', term: 'اختبار قياس إضافي', title: 'الجزء الأول', score: 14, max: 20 } });
    const partTwo = await request('POST', '/api/school-admin/results', { cookie: sac, body: { studentId: R('ليلى حسن ناصر').id, subject: QURAN, examType: 'الاختبار الشهري', term: 'اختبار قياس إضافي', title: 'الجزء الثاني', score: 16, max: 20 } });
    ck('same monthly assessment permits distinct part-one and part-two titles', partOne.status === 201 && partTwo.status === 201);
    ck('the same titled assessment part is still rejected as a duplicate', (await request('POST', '/api/school-admin/results', { cookie: sac, body: { studentId: R('ليلى حسن ناصر').id, subject: QURAN, examType: 'الاختبار الشهري', term: 'اختبار قياس إضافي', title: 'الجزء الثاني', score: 17, max: 20 } })).status === 409);
    const lesson = { day: 'الأحد', period: 1, grade: G1, section: 'أ', subject: QURAN, teacherId: t1.json.teacher.id, start: '07:30', end: '08:15', room: '1' };
    const sch = await request('PUT', '/api/school-admin/schedule', { cookie: sac, body: { lessons: [lesson] } });
    ck('school admin saves a timetable lesson with an assigned teacher', sch.status === 200 && sch.json.lessons.length === 1);
    ck('timetable rejects a teacher/class collision in the same period', (await request('PUT', '/api/school-admin/schedule', { cookie: sac, body: { lessons: [lesson, { ...lesson, section: 'ب' }] } })).status === 409);
    ck('teacher sees only their own timetable', (await request('GET', '/api/school-member/schedule', { cookie: tc1 })).json.lessons.length === 1 && (await request('GET', '/api/school-member/schedule', { cookie: tc2 })).json.lessons.length === 0);
    const att = await request('POST', '/api/school-admin/attendance', { cookie: sac, body: { date: '2026-11-20', grade: G1, section: 'أ', rows: [{ studentId: R('أحمد علي محمد').id, status: 'present' }, { studentId: R('سارة خالد أحمد').id, status: 'absent' }] } });
    const attRead = await request('GET', '/api/school-admin/attendance?date=2026-11-20&grade=' + encodeURIComponent(G1), { cookie: sac });
    ck('attendance records save and return a daily summary', att.status === 201 && att.json.saved === 2 && attRead.json.summary.present === 1 && attRead.json.summary.absent === 1);
    ck('attendance rejects unknown students and anonymous access', (await request('POST', '/api/school-admin/attendance', { cookie: sac, body: { date: '2026-11-20', grade: G1, rows: [{ studentId: 'not-a-student', status: 'absent' }] } })).status === 400 && (await request('GET', '/api/school-admin/attendance')).status === 401);
    const cert = await request('POST', '/api/school-admin/certificates', { cookie: sac, body: { studentId: R('أحمد علي محمد').id, grade: G1, academicYear: '2026-2027', kind: 'first_term' } });
    ck('certificate issuance stores a historical snapshot with term results', cert.status === 201 && cert.json.certificate.snapshot === true && cert.json.certificate.subjects.length >= 1 && cert.json.certificate.kind === 'first_term');
    ck('certificate snapshot uses the explicitly selected academic year and grade', cert.json.certificate.academicYear === '2026-2027' && cert.json.certificate.grade === G1);
    ck('certificate API rejects a student outside the selected grade', (await request('POST', '/api/school-admin/certificates', { cookie: sac, body: { studentId: R('أحمد علي محمد').id, grade: G2, academicYear: '2026-2027', kind: 'first_term' } })).status === 400);
    ck('certificate includes class rank, grade letter, descriptive grade and separate signature/seal placeholders', cert.json.certificate.rank >= 1 && cert.json.certificate.rankOutOf >= 1 && ['A','B','C','D','E','F'].includes(cert.json.certificate.gradeLetter) && !!cert.json.certificate.gradeLabel && Object.prototype.hasOwnProperty.call(cert.json.certificate.signatureFields,'ministryOfficial') && Object.prototype.hasOwnProperty.call(cert.json.certificate.signatureFields,'ministrySeal') && cert.json.certificate.template === 'yemen-school-report-v3');
    const annual = await request('POST', '/api/school-admin/certificates', { cookie: sac, body: { studentId: R('أحمد علي محمد').id, grade: G1, academicYear: '2026-2027', kind: 'annual' } });
    const quranAnnual = annual.json?.certificate?.subjects?.find(x => x.subject === 'القرآن');
    ck('annual certificate snapshot keeps first and second semester components separate', annual.status === 201 && quranAnnual?.firstMonthly?.score === 19 && quranAnnual?.firstExam?.score > 0 && quranAnnual?.secondMonthly?.score === 10 && quranAnnual?.secondExam?.score === 25 && quranAnnual?.annualTotal?.max === (quranAnnual.firstMonthly.max + quranAnnual.firstExam.max + quranAnnual.secondMonthly.max + quranAnnual.secondExam.max));
    ck('school certificate archive is private to the school admin', (await request('GET', '/api/school-admin/certificates', { cookie: sac })).json.certificates.length === 2 && (await request('GET', '/api/school-admin/certificates')).status === 401);

    // ---------- student transcript ----------
    const reg = await request('POST', '/api/student/register', { body: { schoolId: sid, name: 'أحمد علي محمد', grade: G1, section: 'أ', email: 'ahmad@example.invalid', password: 'Student-Password-1' } });
    const mem = (await request('GET', '/api/school-admin/members', { cookie: sac })).json.members.find(m => m.email === 'ahmad@example.invalid');
    ck('student registration asks for the name and grade without a roster identifier', reg.status === 201 && !mem.rosterId && mem.name === 'أحمد علي محمد' && mem.grade === G1);
    ck('student registration cannot be submitted through the teacher join endpoint', (await request('POST', '/api/school-members/register', { body: { schoolId: sid, role: 'student', name: 'اسم آخر', grade: G1, email: 'other-student@example.invalid', password: 'Student-Password-1' } })).status === 403);
    ck('public roster lookup no longer exposes any student names', (await request('GET', '/api/school-roster?schoolId=' + sid + '&grade=' + encodeURIComponent(G1))).status === 410);
    ck('student account cannot be approved without the school-side roster match', (await request('POST', '/api/school-admin/members/review', { cookie: sac, body: { id: mem.id, action: 'approve' } })).status === 404);
    ck('school admin cannot link a different student name even within the same grade', (await request('POST', '/api/school-admin/members/review', { cookie: sac, body: { id: mem.id, action: 'approve', rosterId: R('سارة خالد أحمد').id } })).status === 409);
    const linkedApproval = await request('POST', '/api/school-admin/members/review', { cookie: sac, body: { id: mem.id, action: 'approve', rosterId: R('أحمد علي محمد').id } });
    ck('school admin matches the student request to the exact school roster record before approval', linkedApproval.status === 200 && (await request('GET', '/api/school-admin/members', { cookie: sac })).json.members.find(m => m.id === mem.id).rosterId === R('أحمد علي محمد').id);
    const stc = ck0(await request('POST', '/api/school-member/login', { body: { email: 'ahmad@example.invalid', password: 'Student-Password-1' } }));
    // ---------- delegated attendance: submit by the class representative, approve only by school admin ----------
    const delegateAssign=await request('PUT','/api/school-admin/attendance/delegates',{cookie:sac,body:{grade:G1,section:'أ',studentId:R('أحمد علي محمد').id}});
    ck('only school administration can assign a representative with an approved student account',delegateAssign.status===200&&delegateAssign.json.delegate.email==='ahmad@example.invalid'&&(await request('PUT','/api/school-admin/attendance/delegates',{body:{grade:G1,section:'أ',studentId:R('أحمد علي محمد').id}})).status===401);
    const delView=await request('GET','/api/school-member/attendance-delegate?date=2026-11-21',{cookie:stc});
    ck('the appointed student representative sees the exact class roster and date',delView.status===200&&delView.json.students.length===3&&delView.json.grade===G1&&delView.json.section==='أ');
    const delSubmit=await request('POST','/api/school-member/attendance-delegate',{cookie:stc,body:{date:'2026-11-21',rows:[{studentId:R('أحمد علي محمد').id,status:'present'},{studentId:R('سارة خالد أحمد').id,status:'late'},{studentId:R('عمر يوسف حسن').id,status:'absent'}]}});
    const delBefore=await request('GET','/api/school-admin/attendance?date=2026-11-21&grade='+encodeURIComponent(G1)+'&section=%D8%A3',{cookie:sac});
    ck('representative submits a complete attendance sheet as pending, not as approved attendance',delSubmit.status===201&&delBefore.json.records.length===0);
    ck('the representative cannot approve their own submission and the admin queue receives it', (await request('POST','/api/school-admin/attendance/review',{cookie:stc,body:{submissionId:'x',action:'approve'}})).status===401&&(await request('GET','/api/school-admin/attendance/pending',{cookie:sac})).json.items.length===1);
    const pendingId=(await request('GET','/api/school-admin/attendance/pending',{cookie:sac})).json.items[0].id;
    const approved=await request('POST','/api/school-admin/attendance/review',{cookie:sac,body:{submissionId:pendingId,action:'approve'}});
    const delAfter=await request('GET','/api/school-admin/attendance?date=2026-11-21&grade='+encodeURIComponent(G1)+'&section=%D8%A3',{cookie:sac});
    ck('only school administration approval publishes the attendance records and records the approver',approved.status===200&&delAfter.json.records.length===3&&delAfter.json.records.every(x=>x.approvedBy==='head@example.invalid'));
    const attPeriod=await request('GET','/api/school-admin/attendance?from=2026-11-20&to=2026-11-21&grade='+encodeURIComponent(G1)+'&section=%D8%A3',{cookie:sac});
    ck('attendance supports a bounded date-range query for monthly and yearly reports',attPeriod.status===200&&attPeriod.json.records.length===5&&attPeriod.json.summary.present===2&&attPeriod.json.summary.absent===2&&attPeriod.json.summary.late===1);
    ck('delegate endpoint is unavailable to a teacher and unassigned student', (await request('GET','/api/school-member/attendance-delegate',{cookie:tc1})).status===403);
    await request('POST','/api/school-admin/attendance/delegates/clear',{cookie:sac,body:{grade:G1,section:'أ'}});
    ck('school administration can revoke the representative assignment', (await request('GET','/api/school-member/attendance-delegate',{cookie:stc})).status===403);

    const studentSchedule = await request('GET', '/api/school-member/schedule', { cookie: stc });
    const studentAttendance = await request('GET', '/api/school-member/attendance?from=2026-11-20&to=2026-11-20', { cookie: stc });
    ck('student sees only the timetable for their own class and section', studentSchedule.status === 200 && studentSchedule.json.lessons.length === 1 && studentSchedule.json.lessons[0].grade === G1 && studentSchedule.json.lessons[0].section === 'أ');
    ck('student sees only their own attendance record; teachers cannot read student attendance', studentAttendance.status === 200 && studentAttendance.json.records.length === 1 && studentAttendance.json.records[0].status === 'present' && (await request('GET', '/api/school-member/attendance', { cookie: tc1 })).status === 403);
    const tr = (await request('GET', '/api/school-member/transcript', { cookie: stc })).json;
    ck('transcript lists the subjects that have grades', reg.status === 201 && tr.subjects.length === 2 && tr.rows.length === 2);
    if (process.env.TRACE) console.log(JSON.stringify(tr.columns.map(c => c.label)));
    ck('columns exist only for exams that were taken, ordered part 1 (monthly, midterm) then part 2', tr.columns.map(c => c.label).join('|') === 'الفصل الأول — المحصلة الأولى|الفصل الأول — الفصل الأول|الفصل الثاني — المحصلة الثانية|الفصل الثاني — الفصل الثاني');
    const q = tr.rows.find(r => r.subject === 'القرآن'), m = tr.rows.find(r => r.subject === MATH);
    ck('cells hold the score and maximum; a subject without that exam has an empty cell', Object.keys(q.cells).length >= 2 && Object.keys(m.cells).length === 1 && m.cells['الفصل الأول|المحصلة الأولى|'].score === 40);
    ck('totals and percentage are computed from the cells that exist', m.total === 40 && m.max === 50 && m.percent === 80);
    const one = (await request('GET', '/api/school-member/transcript?subject=' + encodeURIComponent(MATH), { cookie: stc })).json;
    ck('filtering by subject shows only that subject (and only its columns)', one.rows.length === 1 && one.columns.length === 1 && one.subjects.length === 2);
    ck('transcripts need a student session', (await request('GET', '/api/school-member/transcript')).status === 401 && (await request('GET', '/api/school-member/transcript', { cookie: tc1 })).status === 403);

    // ---------- guardian ----------
    const pc = ck0(await request('POST', '/api/parent/register', { body: { email: 'dad@example.invalid', password: 'Parent-Password-1' } }));
    await request('POST', '/api/parent/guardian-links/request', { cookie: pc, body: { schoolId: sid, studentEmail: 'ahmad@example.invalid', relationship: 'أب' } });
    const lk = (await request('GET', '/api/school-admin/guardian-links', { cookie: sac })).json.links[0];
    await request('POST', '/api/school-admin/guardian-links/review', { cookie: sac, body: { id: lk.id, action: 'approve' } });
    const gt = (await request('GET', '/api/parent/transcript', { cookie: pc })).json;
    ck('the guardian sees the child transcript', gt.students.length === 1 && gt.students[0].studentName === 'أحمد علي محمد' && gt.students[0].rows.length === 2);
    ck('the guardian transcript needs a parent session', (await request('GET', '/api/parent/transcript')).status === 401 && (await request('GET', '/api/parent/transcript', { cookie: stc })).status === 401);
    // fee-based hiding
    await request('PUT', '/api/school-admin/fees/config', { cookie: sac, body: { currency: 'ريال', types: [{ id: 'monthly', name: 'الرسوم', amount: 100, active: true }], policy: { mode: 'balance', maxBalance: 0 } } });
    const hid = (await request('GET', '/api/school-member/transcript', { cookie: stc })).json, ghid = (await request('GET', '/api/parent/transcript', { cookie: pc })).json.students[0];
    ck('with an unpaid balance the transcript keeps the subjects but hides every score', hid.hidden === true && hid.rows.length === 2 && !JSON.stringify(hid).includes('"score"') && hid.rows.every(r => r.total === null));
    ck('the guardian transcript is hidden too', ghid.hidden === true && !JSON.stringify(ghid).includes('"score"'));
    await request('PUT', '/api/school-admin/fees/config', { cookie: sac, body: { currency: 'ريال', types: [{ id: 'monthly', name: 'الرسوم', amount: 100, active: true }], policy: { mode: 'off' } } });

    // ---------- notes and complaints ----------
    const note = (cookie, kind, text, studentId) => request('POST', '/api/school-member/teacher/notes', { cookie, body: { studentId: studentId || R('أحمد علي محمد').id, kind, text } });
    ck('a teacher writes a praise, a note and a complaint for his student', (await note(tc1, 'praise', 'متفوق في الحفظ')).status === 201 && (await note(tc1, 'note', 'يحتاج مراجعة السور')).status === 201 && (await note(tc1, 'complaint', 'تكرر غيابه')).status === 201);
    ck('…but not for a student outside his grades, and not an empty or unknown kind', (await note(tc2, 'note', 'x', R('ليلى حسن ناصر').id)).status === 403 && (await note(tc1, 'note', '')).status === 400 && (await note(tc1, 'weird', 'x')).status === 400);
    const sn = (await request('GET', '/api/school-member/notes', { cookie: stc })).json.notes, pn = (await request('GET', '/api/parent/notes', { cookie: pc })).json.students[0].notes;
    ck('the student sees notes and praise but NOT complaints', sn.length === 2 && !sn.some(n => n.kind === 'complaint'));
    ck('the guardian sees all three kinds with who wrote them', pn.length === 3 && pn.some(n => n.kind === 'complaint' && n.by === 'الأستاذ عبدالله'));
    await wait(300);
    const sNot = (await request('GET', '/api/school-member/notifications', { cookie: stc })).json.items, pNot = (await request('GET', '/api/parent/notifications', { cookie: pc })).json.items;
    ck('the complaint notification goes to the guardian only', pNot.filter(n => n.kind === 'note').length === 3 && sNot.filter(n => n.kind === 'note').length === 2);
    const an = await request('POST', '/api/school-admin/notes', { cookie: sac, body: { studentId: R('أحمد علي محمد').id, kind: 'note', text: 'تواصلوا مع الإدارة' } });
    ck('the school admin can add and remove notes', an.status === 201 && (await request('DELETE', '/api/school-admin/notes/' + an.json.note.id, { cookie: sac })).status === 200);

    // ---------- teacher posts follow assignments ----------
    const tp = (cookie, b) => request('POST', '/api/school-member/teacher-posts', { cookie, body: { title: 'واجب', content: 'حل التمارين', type: 'assignment', ...b } });
    ck('posting follows the teacher assignments (grade + subject)', (await tp(tc1, { grade: G1, subject: QURAN })).status === 201 && (await tp(tc1, { grade: G2, subject: MATH })).status === 201);
    ck('…a subject or grade that is not assigned is refused, and the grade is required', (await tp(tc1, { grade: G1, subject: MATH })).status === 403 && (await tp(tc1, { grade: G2, subject: QURAN })).status === 403 && (await tp(tc1, { subject: QURAN })).status === 400);

    // ---------- platform owner controls teachers ----------
    const pt = await request('POST', '/api/admin/schools/' + sid + '/teachers', { cookie: ac, body: { name: 'معلم المنصة', email: 'plat@example.invalid', password: 'Teacher-Password-3', assignments: [{ grade: G2, subject: 'العلوم' }] } });
    ck('the platform owner adds a teacher to any school', pt.status === 201 && (await request('GET', '/api/admin/schools/' + sid + '/teachers', { cookie: ac })).json.teachers.length === 3);
    ck('…anonymous and school admins cannot', (await request('POST', '/api/admin/schools/' + sid + '/teachers', { body: {} })).status === 401 && (await request('POST', '/api/admin/schools/' + sid + '/teachers', { cookie: sac, body: {} })).status === 401);
    const pe = await request('PATCH', '/api/admin/schools/' + sid + '/teachers/' + pt.json.teacher.id, { cookie: ac, body: { assignments: [{ grade: G1, subject: 'العلوم' }, { grade: G2, subject: 'العلوم' }] } });
    ck('assignments can be edited', pe.status === 200 && pe.json.teacher.assignments.length === 2);
    const rp = await request('PATCH', '/api/school-admin/teachers/' + t2.json.teacher.id, { cookie: sac, body: { newPassword: 'Teacher-Password-9' } });
    ck('password reset ends the old session and the old password stops working', rp.status === 200 && (await request('GET', '/api/school-member/teacher/overview', { cookie: tc2 })).status === 401 && (await request('POST', '/api/school-member/login', { body: { email: 'huda@example.invalid', password: 'Teacher-Password-2' } })).status === 401 && (await request('POST', '/api/school-member/login', { body: { email: 'huda@example.invalid', password: 'Teacher-Password-9' } })).status === 200);
    await request('PATCH', '/api/school-admin/teachers/' + t1.json.teacher.id, { cookie: sac, body: { active: false } });
    ck('a disabled teacher is logged out and cannot log in', (await request('GET', '/api/school-member/teacher/overview', { cookie: tc1 })).status === 401 && (await request('POST', '/api/school-member/login', { body: { email: 'abd@example.invalid', password: 'Teacher-Password-1' } })).status >= 400);
    // ---------- grade-specific curriculum ----------
    const curriculumSave=await request('PUT','/api/school-admin/settings',{cookie:sac,body:{grades:[G1,G2],subjects:[QURAN,MATH],gradeSubjects:{[G1]:[QURAN],[G2]:[MATH]}}});
    const curriculumOptions=(await request('GET','/api/school-admin/academic-options',{cookie:sac})).json;
    ck('school stores an independent subject list for every grade and returns it to the admin UI',curriculumSave.status===200&&curriculumOptions.gradeSubjects[G1].length===1&&curriculumOptions.gradeSubjects[G1][0]===QURAN&&curriculumOptions.gradeSubjects[G2][0]===MATH);
    ck('the school overview preserves grade-specific subjects after reload',JSON.stringify((await request('GET','/api/school-admin/overview',{cookie:sac})).json.school.gradeSubjects)===JSON.stringify({[G1]:[QURAN],[G2]:[MATH]}));
    ck('the server refuses to record a subject not assigned to the student grade', (await request('POST','/api/school-admin/results',{cookie:sac,body:{studentId:R('أحمد علي محمد').id,subject:MATH,term:'الفصل الأول',examType:'المحصلة الأولى',score:1,max:20}})).status===400);
    const curriculumTranscript=(await request('GET','/api/school-member/transcript',{cookie:stc})).json;
    const curriculumParent=(await request('GET','/api/parent/transcript',{cookie:pc})).json.students[0];
    ck('student and guardian transcripts use only the exact same subjects assigned to the student grade',curriculumTranscript.subjects.length===1&&curriculumTranscript.subjects[0]==='القرآن'&&curriculumParent.subjects.length===1&&curriculumParent.subjects[0]==='القرآن');
    const courseCert=await request('POST','/api/school-admin/certificates',{cookie:sac,body:{studentId:R('أحمد علي محمد').id,grade:G1,academicYear:'2026-2027',kind:'coursework'}});
    ck('coursework certificate is a distinct certificate and contains only the subjects assigned to the grade',courseCert.status===201&&courseCert.json.certificate.kind==='coursework'&&courseCert.json.certificate.kindLabel==='شهادة أعمال السنة'&&courseCert.json.certificate.subjects.every(x=>x.subject==='القرآن'));
  } catch (e) { console.error('academics check crashed:', e.stack || e, '\n--- server log ---\n' + log); process.exitCode = 1; }
  let failed = 0; for (const [l, ok] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) failed++; }
  console.log(`\n${checks.length - failed}/${checks.length} academics checks passed.`); if (failed) process.exitCode = 1;
  child.kill('SIGTERM'); await wait(150); fs.rmSync(temp, { recursive: true, force: true });
})();
