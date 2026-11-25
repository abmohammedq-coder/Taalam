'use strict';
// HTTP integration smoke test. Uses a temporary parser stub because this test
// verifies routing/auth/HTTP behavior, not real PDF extraction quality.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'taallam-http-test-'));
const modules = path.join(temp, 'modules', 'pdf-parse');
fs.mkdirSync(modules, { recursive: true });
fs.writeFileSync(path.join(modules, 'index.js'), "module.exports = async function(){ return { text: 'اختبار نص PDF تجريبي يتجاوز الحد الأدنى للاختبار، ويُستخدم فقط للتحقق من مسارات HTTP وليس لاختبار استخراج PDF الحقيقي.', numpages: 1 }; };\n");
const port = 31000 + Math.floor(Math.random() * 20000);
const env = { ...process.env, PORT: String(port), DATA_DIR: path.join(temp, 'data'), NODE_PATH: path.join(temp, 'modules'), ADMIN_EMAIL: 'test-admin@example.invalid', ADMIN_PASSWORD: 'TestPassword-Only-For-Smoke-Check-123', NODE_ENV: 'test' };
const child = spawn(process.execPath, [path.join(root, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', d => output += d.toString());
child.stderr.on('data', d => output += d.toString());
const wait = ms => new Promise(r => setTimeout(r, ms));
function request(urlPath, options={}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: urlPath, method: options.method || 'GET', headers: options.headers || {} }, res => {
      let body=''; res.setEncoding('utf8'); res.on('data', d => body += d); res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject); if (options.body) req.write(options.body); req.end();
  });
}
(async () => {
  const checks=[];
  try {
    let ready=false;
    for(let i=0;i<60;i++){ if(child.exitCode!==null) throw new Error('Server exited before readiness. '+output); try { const r=await request('/api/teacher/status'); if(r.status===200){ready=true;break;} } catch {} await wait(200); }
    if(!ready) throw new Error('Server did not become ready. '+output);
    const schoolAlias=await request('/school'); checks.push(['the /school shortcut opens the school-admin app',schoolAlias.status===302&&schoolAlias.headers.location==='/school-admin/']);
    for(const [label,url] of [['public homepage','/'],['student portal','/student/'],['teacher portal','/teacher/'],['guardian portal','/guardian/'],['school admin portal','/school-admin/'],['school portal','/teacher/school'],['admin portal','/admin/']]) {
      const r=await request(url); checks.push([label,r.status===200 && r.headers['content-type']?.includes('text/html')]);
    }
    for(const [label,url,needle] of [['admin scoped service worker','/admin/sw.js','taallam-admin-shell-'],['school admin scoped service worker','/school-admin/sw.js','taallam-school-admin-shell-'],['admin manifest','/manifest-admin.webmanifest','/admin/'],['school admin manifest','/manifest-school-admin.webmanifest','/school-admin/']]) { const r=await request(url); checks.push([label,r.status===200 && r.body.includes(needle)]); }
    const status=await request('/api/teacher/status'); checks.push(['teacher status API responds JSON',status.status===200 && JSON.parse(status.body).configured===false]);
    const askNoBook=await request('/api/teacher/ask',{method:'POST',headers:{'Content-Type':'application/json','Origin':`http://127.0.0.1:${port}`},body:JSON.stringify({question:'اشرح الدرس'})});
    checks.push(['teacher question requires selected curriculum book',askNoBook.status===400 && JSON.parse(askNoBook.body).error.includes('اختر كتابًا')]);
    const adminPdfStatus=await request('/api/admin/pdf-status'); checks.push(['PDF diagnostic rejects unauthenticated access',adminPdfStatus.status===401]);
    const login=await request('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json','Origin':`http://127.0.0.1:${port}`},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})});
    let cookie=''; if(login.status===200) cookie=String(login.headers['set-cookie']||'').split(';')[0];
    checks.push(['admin login accepts configured test credentials',login.status===200 && !!cookie]);
    const saveAwareness=await request('/api/admin/platform/settings',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json','Origin':`http://127.0.0.1:${port}`},body:JSON.stringify({appName:'تعلّم مع الهيثم',awarenessItems:[{title:'رسالة اختبار',text:'محتوى توعوي تجريبي',startsAt:'2020-01-01T00:00+03:00',endsAt:'2099-01-01T00:00+03:00',priority:7,active:true},{title:'رسالة منتهية',text:'لا يجب عرضها',startsAt:'2020-01-01T00:00+03:00',endsAt:'2020-01-02T00:00+03:00',priority:99,active:true}]})});
    let awarenessSaved=false;try{const j=JSON.parse(saveAwareness.body);awarenessSaved=saveAwareness.status===200&&j.saved===true&&j.settings.awarenessItems.length===2;}catch{}
    checks.push(['superadmin can save scheduled awareness content',awarenessSaved]);
    const publicSettings=await request('/api/platform/settings');let awarenessPublic=false;try{const j=JSON.parse(publicSettings.body);awarenessPublic=publicSettings.status===200&&j.awarenessItems.length===1&&j.awarenessItems[0].title==='رسالة اختبار'&&j.awarenessItems[0].priority===7;}catch{}
    checks.push(['public settings expose only active awareness items inside their schedule',awarenessPublic]);
    const diag=await request('/api/admin/pdf-status',{headers:{Cookie:cookie}});
    let diagOk=false; try { const j=JSON.parse(diag.body); diagOk=diag.status===200 && j.pdfParser.available===true && typeof j.ocr==='object' && typeof j.storage==='object'; } catch {}
    checks.push(['authenticated PDF diagnostic returns structured readiness data',diagOk]);
    const createSchool=await request('/api/admin/schools',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','Origin':`http://127.0.0.1:${port}`},body:JSON.stringify({name:'مدرسة اختبار الأرشيف',adminName:'مدير الاختبار',adminEmail:'school-admin@example.invalid',adminPassword:'SchoolPassword-Only-For-Smoke-123',schoolYear:'2026-2027',grades:['الأول الأساسي']})});
    let schoolId='';try{schoolId=JSON.parse(createSchool.body).school.id}catch{}
    checks.push(['superadmin can create isolated school for archive test',createSchool.status===201&&!!schoolId]);
    const schoolLogin=await request('/api/school-admin/login',{method:'POST',headers:{'Content-Type':'application/json','Origin':`http://127.0.0.1:${port}`},body:JSON.stringify({email:'school-admin@example.invalid',password:'SchoolPassword-Only-For-Smoke-123'})});
    const schoolCookie=String(schoolLogin.headers['set-cookie']||'').split(';')[0];checks.push(['school principal can sign in for archive test',schoolLogin.status===200&&!!schoolCookie]);
    const dataDir=path.join(temp,'data');
    const put=(name,value)=>fs.writeFileSync(path.join(dataDir,name),JSON.stringify(value));
    const year='2026-2027';
    put('school-roster.json',{students:[{id:'roster-1',schoolId,name:'طالب أرشيف',grade:'الأول الأساسي'}]});
    put('school-fees.json',{payments:[{id:'pay-1',schoolId,studentId:'roster-1',amount:100}],dues:[{id:'due-1',schoolId,studentId:'roster-1',due:200}]});
    put('school-results.json',{results:[{id:'result-1',schoolId,studentId:'roster-1',academicYear:year,score:49,max:100}],overrides:{[schoolId+':roster-1']:'show'}});
    put('school-schedules.json',{lessons:[{id:'schedule-1',schoolId,grade:'الأول الأساسي'}]});
    put('school-attendance.json',{records:[{id:'attendance-1',schoolId,date:'2026-10-01',studentId:'roster-1'}],pending:[],delegates:[]});
    put('school-certificates.json',{certificates:[{id:'certificate-1',schoolId,academicYear:year}]});
    put('school-online-learning.json',{courses:[{id:'course-1',schoolId,academicYear:year}],lessons:[{id:'lesson-1',schoolId,courseId:'course-1'}],sessions:[],attendance:[],progress:[],quizzes:[{id:'quiz-1',schoolId,courseId:'course-1'}],attempts:[],discussions:[],files:[],assignments:[],submissions:[],boards:[],recordings:[]});
    const archiveCreate=await request('/api/school-admin/years/archive',{method:'POST',headers:{Cookie:schoolCookie,'Content-Type':'application/json','Origin':`http://127.0.0.1:${port}`},body:JSON.stringify({academicYear:year})});
    let archiveId='';try{archiveId=JSON.parse(archiveCreate.body).archive.id}catch{}
    checks.push(['school admin can create year archive',archiveCreate.status===201&&!!archiveId]);
    const archiveRead=await request('/api/school-admin/years/archive/'+encodeURIComponent(archiveId),{headers:{Cookie:schoolCookie}});let archiveData=null;try{archiveData=JSON.parse(archiveRead.body).archive}catch{}
    checks.push(['archive includes roster, finance, grades, attendance, certificates and online learning',archiveRead.status===200&&archiveData?.schemaVersion===2&&archiveData.data.roster.length===1&&archiveData.data.fees.payments.length===1&&archiveData.data.results.results.length===1&&archiveData.data.attendance.records.length===1&&archiveData.data.certificates.length===1&&archiveData.data.onlineLearning.lessons.length===1]);
    const archiveExport=await request('/api/school-admin/years/archive/'+encodeURIComponent(archiveId)+'/export',{headers:{Cookie:schoolCookie}});
    checks.push(['archive export returns a verified downloadable JSON attachment',archiveExport.status===200&&archiveExport.headers['content-type']?.includes('application/json')&&String(archiveExport.headers['content-disposition']||'').includes('attachment')&&archiveExport.body.includes('schoolProfile')]);
    // Empty the archived stores and verify the restore merges the snapshot back.
    put('school-roster.json',{students:[]});put('school-fees.json',{payments:[],dues:[]});put('school-results.json',{results:[],overrides:{}});
    put('school-schedules.json',{lessons:[]});put('school-attendance.json',{records:[],pending:[],delegates:[]});put('school-certificates.json',{certificates:[]});
    put('school-online-learning.json',{courses:[],lessons:[],sessions:[],attendance:[],progress:[],quizzes:[],attempts:[],discussions:[],files:[],assignments:[],submissions:[],boards:[],recordings:[]});

    const badRestore=await request('/api/school-admin/years/archive/'+encodeURIComponent(archiveId)+'/restore',{method:'POST',headers:{Cookie:schoolCookie,'Content-Type':'application/json','Origin':`http://127.0.0.1:${port}`},body:JSON.stringify({confirm:'wrong'})});
    checks.push(['archive restore requires exact confirmation phrase',badRestore.status===400]);
    const goodRestore=await request('/api/school-admin/years/archive/'+encodeURIComponent(archiveId)+'/restore',{method:'POST',headers:{Cookie:schoolCookie,'Content-Type':'application/json','Origin':`http://127.0.0.1:${port}`},body:JSON.stringify({confirm:'RESTORE '+year})});
    let restoredRoster=[];try{restoredRoster=JSON.parse(fs.readFileSync(path.join(dataDir,'school-roster.json'),'utf8')).students}catch{}
    checks.push(['verified archive restore merges missing roster records',goodRestore.status===200&&restoredRoster.some(x=>x.id==='roster-1')]);
    const readStore=name=>JSON.parse(fs.readFileSync(path.join(dataDir,name),'utf8'));
    const restoredFees=readStore('school-fees.json'),restoredResults=readStore('school-results.json'),restoredAttendance=readStore('school-attendance.json'),restoredOnline=readStore('school-online-learning.json');
    checks.push(['archive restore merges finance, grades, attendance and online-learning records',restoredFees.payments.some(x=>x.id==='pay-1')&&restoredFees.dues.some(x=>x.id==='due-1')&&restoredResults.results.some(x=>x.id==='result-1')&&restoredAttendance.records.some(x=>x.id==='attendance-1')&&restoredOnline.courses.some(x=>x.id==='course-1')&&restoredOnline.lessons.some(x=>x.id==='lesson-1')&&restoredOnline.quizzes.some(x=>x.id==='quiz-1')]);

    const archiveFile=path.join(dataDir,'school-archives.json');const storedArchives=JSON.parse(fs.readFileSync(archiveFile,'utf8'));const storedArchive=storedArchives.archives.find(x=>x.id===archiveId);storedArchive.data.schoolProfile.name='تم العبث بالنسخة';fs.writeFileSync(archiveFile,JSON.stringify(storedArchives));
    const tamperedArchive=await request('/api/school-admin/years/archive/'+encodeURIComponent(archiveId),{headers:{Cookie:schoolCookie}});
    checks.push(['archive integrity check rejects altered snapshot data',tamperedArchive.status===409&&JSON.parse(tamperedArchive.body).error.includes('سلامة الأرشيف')]);
    let failed=0; for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failed++;}
    console.log(`\n${checks.length-failed}/${checks.length} HTTP integration checks passed (PDF parser is a test stub; real PDF parsing/OCR is not tested here).`);
    if(failed) process.exitCode=1;
  } catch(e) { console.error('HTTP smoke test failed:',e.stack||e); process.exitCode=1; }
  finally { child.kill('SIGTERM'); await wait(150); fs.rmSync(temp,{recursive:true,force:true}); }
})();
