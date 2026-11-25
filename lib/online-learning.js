'use strict';
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

module.exports = function createOnlineLearning(ctx) {
  const file = path.join(ctx.dataDir, 'school-online-learning.json');
  const fileDir = path.join(ctx.dataDir, 'school-online-learning-files');
  fs.mkdirSync(fileDir,{recursive:true});
  const now = () => new Date().toISOString();
  const str = (v, n=500) => String(v == null ? '' : v).trim().slice(0,n);
  const E = (message, status=400) => Object.assign(new Error(message), { status });
  const read = () => {
    const d = ctx.readJsonFile(file, {});
    return {
      courses: Array.isArray(d.courses) ? d.courses : [],
      lessons: Array.isArray(d.lessons) ? d.lessons : [],
      sessions: Array.isArray(d.sessions) ? d.sessions : [],
      attendance: Array.isArray(d.attendance) ? d.attendance : [],
      progress: Array.isArray(d.progress) ? d.progress : [],
      quizzes: Array.isArray(d.quizzes) ? d.quizzes : [],
      attempts: Array.isArray(d.attempts) ? d.attempts : [],
      discussions: Array.isArray(d.discussions) ? d.discussions : [],
      files: Array.isArray(d.files) ? d.files : [],
      assignments: Array.isArray(d.assignments) ? d.assignments : [],
      submissions: Array.isArray(d.submissions) ? d.submissions : [],
      boards: Array.isArray(d.boards) ? d.boards : [],
      recordings: Array.isArray(d.recordings) ? d.recordings : []
    };
  };
  const save = d => ctx.saveJsonFile(file, d);
  const fail = (res, status, message) => ctx.send(res, status, { error: message });
  const readBinary = (req,max,label='الملف') => new Promise((resolve,reject)=>{const chunks=[];let size=0,failed=false;req.on('data',chunk=>{if(failed)return;size+=chunk.length;if(size>max){failed=true;req.resume();reject(E('حجم '+label+' يتجاوز الحد المسموح.',413));return;}chunks.push(chunk)});req.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks))});req.on('error',reject)});
  const writeBinaryFile = (req,disk,max,label='الملف') => new Promise((resolve,reject)=>{
    const out=fs.createWriteStream(disk,{flags:'wx',mode:0o600});let size=0,settled=false;
    const remove=()=>{try{fs.unlinkSync(disk)}catch{}};
    const failOnce=e=>{if(settled)return;settled=true;remove();reject(e)};
    req.on('data',chunk=>{size+=chunk.length;if(size>max&&!settled){settled=true;req.unpipe(out);out.destroy();req.resume();remove();reject(E('حجم '+label+' يتجاوز الحد المسموح.',413));}});
    req.on('error',e=>failOnce(e));out.on('error',e=>failOnce(e));
    out.on('finish',()=>{if(settled)return;if(size<16){failOnce(E('ملف '+label+' فارغ أو غير صالح.'));return;}settled=true;resolve(size);});
    req.pipe(out);
  });
  const safeVideo = value => {
    const raw = str(value, 1000);
    if (!raw) return '';
    let u; try { u = new URL(raw); } catch { throw E('رابط الفيديو غير صحيح.'); }
    if (u.protocol !== 'https:' || !['youtube.com','www.youtube.com','youtu.be','www.youtube-nocookie.com','vimeo.com','www.vimeo.com','player.vimeo.com'].includes(u.hostname.toLowerCase())) throw E('استخدم رابط فيديو HTTPS من YouTube أو Vimeo.');
    return u.toString();
  };
  const curriculumConfigured = school => !!(school.gradeSubjects && typeof school.gradeSubjects === 'object' && !Array.isArray(school.gradeSubjects) && Object.keys(school.gradeSubjects).length);
  const subjectAssignedToGrade = (school, grade, subject) => !curriculumConfigured(school) || (Array.isArray(school.gradeSubjects[grade]) && school.gradeSubjects[grade].includes(subject));
  const memberCanTeach = (m, school, grade, subject) => {
    const assigned = Array.isArray(m.assignments) && m.assignments.length
      ? m.assignments
      : (m.subjects || []).flatMap(s => (m.grade ? [m.grade] : (school.grades || [])).map(g => ({ grade:g, subject:s })));
    return subjectAssignedToGrade(school,grade,subject) && assigned.some(a => a.grade === grade && a.subject === subject);
  };
  const courseVisibleTo = (c, m) => c.status === 'published' && c.grade === m.grade && (!c.section || c.section === (m.section || ''));
  const getCourse = (db, schoolId, id) => db.courses.find(x => x.id === id && x.schoolId === schoolId);
  const getSession = (db, schoolId, id) => db.sessions.find(x => x.id === id && x.schoolId === schoolId);
  const publicQuiz = q => ({ id:q.id, courseId:q.courseId, lessonId:q.lessonId || '', title:q.title, description:q.description, opensAt:q.opensAt, closesAt:q.closesAt, maxAttempts:q.maxAttempts, status:q.status, questions:q.questions.map(x => ({ id:x.id, prompt:x.prompt, options:x.options, points:x.points })) });
  const dailyConfig = () => ({ apiKey: str(process.env.DAILY_API_KEY, 500), domain: str(process.env.DAILY_DOMAIN, 180).replace(/^https?:\/\//,'').replace(/\/$/,'') });
  async function dailyRequest(endpoint, payload) {
    const {apiKey} = dailyConfig();
    if (!apiKey) throw E('خدمة الاجتماعات Daily غير مهيأة. أضف DAILY_API_KEY وDAILY_DOMAIN في إعدادات الخادم.',503);
    const response = await fetch('https://api.daily.co/v1' + endpoint, {method:payload?'POST':'GET',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(15000)});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) {
      if (response.status===409) return {conflict:true};
      const reason = str(data.info || data.error || data.message || '', 240);
      throw E('تعذّر تجهيز غرفة Daily: '+(reason||'تحقق من مفتاح API والنطاق وحدود الحساب.'), response.status>=500?503:502);
    }
    return data;
  }
  async function dailyJoinData(session, actor, actorRole) {
    const {domain} = dailyConfig();
    if (!/^[a-z0-9-]+\.daily\.co$/i.test(domain)) throw E('نطاق Daily غير صحيح. أدخل النطاق الذي ينتهي بـ .daily.co في DAILY_DOMAIN.',503);
    let roomUrl = str(session.dailyRoomUrl,500);
    if (!roomUrl) {
      const exp = Math.floor(Date.now()/1000) + Math.max(3600, Math.min(86400, (Number(session.durationMinutes)||40)*60 + 21600));
      const created = await dailyRequest('/rooms',{name:session.roomName,privacy:'private',properties:{exp,enable_prejoin_ui:true,enable_chat:true,enable_screenshare:true,start_video_off:false,start_audio_off:true,eject_at_room_exp:true}});
      roomUrl = str(created.url,500) || ('https://'+domain+'/'+encodeURIComponent(session.roomName));
      if (!/^https:\/\/[a-z0-9.-]+\.daily\.co\/[a-z0-9_-]+$/i.test(roomUrl)) throw E('أعاد مزود Daily رابط غرفة غير صالح.',502);
      session.dailyRoomUrl = roomUrl;
    }
    const tokenExp = Math.floor(Date.now()/1000)+900;
    const tokenData = await dailyRequest('/meeting-tokens',{properties:{room_name:session.roomName,exp:tokenExp,is_owner:actorRole!=='student',user_name:str(actor.name||actor.email||'مشارك',80),user_id:str(actor.id||actor.email||crypto.randomUUID(),120),enable_screenshare:actorRole!=='student',start_video_off:false,start_audio_off:actorRole==='student',enable_prejoin_ui:true}});
    if (!tokenData.token) throw E('لم يصدر مزود Daily رمز دخول للحصة.',502);
    return {provider:'daily',url:roomUrl,domain,roomName:session.roomName,token:tokenData.token,displayName:str(actor.name||actor.email||'مشارك',80),role:actorRole,publicDemo:true};
  }

  async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/online-learning')) return false;
    const db = read();
    try {
      if (pathname === '/api/online-learning' && req.method === 'GET') {
        const adminSession = ctx.sessionSchoolAdmin(req);
        const admin = adminSession ? ctx.requireSchoolAdmin(req,res) : null;
        if (adminSession && !admin) return true;
        const member = adminSession ? null : ctx.sessionSchoolMember(req);
        if (!admin && !member) return fail(res,401,'سجّل الدخول بحساب مدرسي معتمد أولًا.'), true;
        const schoolId = admin ? admin.schoolId : member.school.id;
        const role = admin ? 'admin' : member.member.role;
        const activeSchool = admin ? admin.school : member.school;
        const courses = db.courses.filter(c => c.schoolId === schoolId && subjectAssignedToGrade(activeSchool,c.grade,c.subject) && (role === 'admin' ? true : role === 'teacher' ? memberCanTeach(member.member, member.school, c.grade, c.subject) : courseVisibleTo(c, member.member)));
        const ids = new Set(courses.map(c => c.id));
        const lessons = db.lessons.filter(x => ids.has(x.courseId) && (role !== 'student' || x.status === 'published'));
        const sessions = db.sessions.filter(x => ids.has(x.courseId) && (role !== 'student' || ['scheduled','live','ended'].includes(x.status))).sort((a,b)=>String(a.startsAt).localeCompare(String(b.startsAt)));
        const quizzes = db.quizzes.filter(x => ids.has(x.courseId) && (role !== 'student' || x.status === 'published')).map(publicQuiz);
        const progress = role === 'student' ? db.progress.filter(x => x.schoolId === schoolId && x.memberId === member.member.id) : [];
        const attempts = role === 'student' ? db.attempts.filter(x => x.schoolId === schoolId && x.memberId === member.member.id).map(({answers, ...x})=>x) : db.attempts.filter(x => ids.has(x.courseId)).map(({answers, ...x})=>x);
        const discussions = db.discussions.filter(x => ids.has(x.courseId));
        const assignments=db.assignments.filter(x=>ids.has(x.courseId)&&(role!=='student'||x.status==='published'));const submissions=role==='student'?db.submissions.filter(x=>x.schoolId===schoolId&&x.memberId===member.member.id):db.submissions.filter(x=>ids.has(x.courseId));const boards=db.boards.filter(x=>ids.has(x.courseId));const recordings=db.recordings.filter(x=>ids.has(x.courseId)&&(role!=='student'||x.status==='published'));return ctx.send(res,200,{role,school:admin?{id:admin.schoolId,name:admin.school.name,schoolYear:admin.school.schoolYear}: {id:member.school.id,name:member.school.name,schoolYear:member.school.schoolYear},member:member?{id:member.member.id,name:member.member.name,role,grade:member.member.grade||'',section:member.member.section||''}:null,courses,lessons,sessions,quizzes,progress,attempts,discussions,assignments,submissions,boards,recordings}),true;
      }
      if (pathname === '/api/online-learning/courses' && req.method === 'POST') {
        const adminSession = ctx.sessionSchoolAdmin(req); const admin = adminSession ? ctx.requireSchoolAdmin(req,res) : null; if(adminSession&&!admin)return true; const member = adminSession ? null : ctx.sessionSchoolMember(req);
        if (!admin && !member) return fail(res,401,'سجّل الدخول بحساب مدرسي معتمد أولًا.'),true;
        const school = admin ? admin.school : member.school, actor = admin ? admin.account : member.member;
        const b = await ctx.readBody(req,12000), title = str(b.title,160), grade = str(b.grade,80), subject = str(b.subject,100), section = str(b.section,80);
        if (!title || !grade || !subject) return fail(res,400,'عنوان المقرر والصف والمادة مطلوبة.'),true;
        if ((school.grades||[]).length && !school.grades.includes(grade)) return fail(res,400,'الصف غير معتمد في المدرسة.'),true;
        const gradeSections=school.gradeSections&&Array.isArray(school.gradeSections[grade])?school.gradeSections[grade]:[];if(section&&gradeSections.length&&!gradeSections.includes(section))return fail(res,400,'الشعبة لا تتبع الصف المحدد.'),true;
        const hasCurriculum=school.gradeSubjects&&typeof school.gradeSubjects==='object'&&!Array.isArray(school.gradeSubjects)&&Object.keys(school.gradeSubjects).length>0;
        const allowed = hasCurriculum ? (Array.isArray(school.gradeSubjects[grade]) ? school.gradeSubjects[grade] : []) : [...new Set([...(school.subjects||[]), 'القرآن الكريم','التربية الإسلامية','اللغة العربية','الرياضيات','العلوم','الاجتماعيات','اللغة الإنجليزية','الحاسوب','التربية الفنية','التربية البدنية','السلوك والمواظبة'])];
        if ((hasCurriculum || allowed.length) && !allowed.includes(subject)) return fail(res,400,'المادة غير مسندة إلى الصف المحدد.'),true;
        if (member && (member.member.role !== 'teacher' || !memberCanTeach(member.member,school,grade,subject))) return fail(res,403,'لا يمكنك إنشاء مقرر في صف أو مادة غير مسندة إليك.'),true;
        const teacherId = member ? member.member.id : str(b.teacherId,80);
        if (teacherId && !member) { const t=ctx.readSchoolMembers().members.find(x=>x.id===teacherId&&x.schoolId===school.id&&x.role==='teacher'&&x.status==='approved'&&x.active); if(!t||!memberCanTeach(t,school,grade,subject)) return fail(res,400,'المعلم المحدد غير معتمد أو غير مسند للمادة والصف.'),true; }
        const course={id:crypto.randomUUID(),schoolId:school.id,title,description:str(b.description,3000),grade,section,subject,teacherId,teacherName:member?member.member.name:(ctx.readSchoolMembers().members.find(x=>x.id===teacherId)||{}).name||'',academicYear:str(school.schoolYear,20),status:admin&&b.publish===true?'published':'draft',createdBy:actor.id||actor.email,createdAt:now(),updatedAt:now()};
        db.courses.unshift(course);save(db);ctx.audit(member?member.member.email:admin.email,'online.course.create',{schoolId:school.id,courseId:course.id,grade,subject,title:course.title,description:course.description,status:course.status});return ctx.send(res,201,{course,message:course.status==='published'?'تم إنشاء المقرر ونشره.':'تم إنشاء المقرر كمسودة.'}),true;
      }
      let m = /^\/api\/online-learning\/courses\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if (m && req.method === 'PATCH') {
        const admin=ctx.requireSchoolAdmin(req,res);if(!admin)return true;const c=getCourse(db,admin.schoolId,m[1]);if(!c)return fail(res,404,'المقرر غير موجود.'),true;
        const b=await ctx.readBody(req,8000);if(b.title!==undefined)c.title=str(b.title,160)||c.title;if(b.description!==undefined)c.description=str(b.description,3000);if(b.section!==undefined)c.section=str(b.section,80);if(b.status!==undefined)c.status=b.status==='published'?'published':'draft';if(b.teacherId!==undefined){const t=ctx.readSchoolMembers().members.find(x=>x.id===str(b.teacherId,80)&&x.schoolId===admin.schoolId&&x.role==='teacher'&&x.active&&x.status==='approved');if(!t||!memberCanTeach(t,admin.school,c.grade,c.subject))return fail(res,400,'المعلم غير معتمد لهذه المادة والصف.'),true;c.teacherId=t.id;c.teacherName=t.name;}c.updatedAt=now();save(db);ctx.audit(admin.email,'online.course.update',{schoolId:admin.schoolId,courseId:c.id,title:c.title,description:c.description,status:c.status});return ctx.send(res,200,{course:c}),true;
      }
      m = /^\/api\/online-learning\/courses\/([A-Za-z0-9_-]+)\/files$/.exec(pathname);
      if(m&&req.method==='POST'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id,c=getCourse(db,schoolId,m[1]);if(!c)return fail(res,404,'المقرر غير موجود.'),true;if(member&&(member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'لا يمكنك رفع ملف لهذا المقرر.'),true;const contentType=String(req.headers['content-type']||'').toLowerCase();if(!contentType.includes('application/pdf')){req.resume();return fail(res,415,'يسمح برفع ملفات PDF فقط في هذه المرحلة.'),true;}const buffer=await readBinary(req,20*1024*1024);if(buffer.length<8||buffer.subarray(0,5).toString('ascii')!=='%PDF-')return fail(res,400,'الملف المرفوع ليس ملف PDF صالحًا.'),true;const id=crypto.randomUUID(),disk=path.join(fileDir,id+'.pdf');fs.writeFileSync(disk,buffer,{mode:0o600,flag:'wx'});const meta={id,schoolId,courseId:c.id,originalName:'lesson-resource.pdf',size:buffer.length,uploadedBy:admin?admin.account.id:member.member.id,createdAt:now()};db.files.push(meta);save(db);return ctx.send(res,201,{file:{id,url:'/api/online-learning/files/'+id,size:buffer.length}}),true;
      }
      m = /^\/api\/online-learning\/courses\/([A-Za-z0-9_-]+)\/videos$/.exec(pathname);
      if(m&&req.method==='POST'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id,c=getCourse(db,schoolId,m[1]);if(!c)return fail(res,404,'المقرر غير موجود.'),true;if(member&&(member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'رفع الفيديو متاح لمعلم المقرر أو الإدارة.'),true;
        const ct=String(req.headers['content-type']||'').split(';')[0].toLowerCase(),types={'video/mp4':['.mp4','video/mp4'],'video/webm':['.webm','video/webm']};if(!types[ct]){req.resume();return fail(res,415,'الصيغ المدعومة حاليًا MP4 وWebM.'),true;}const id=crypto.randomUUID(),[ext,mime]=types[ct],disk=path.join(fileDir,id+ext);const size=await writeBinaryFile(req,disk,200*1024*1024,'الفيديو');const meta={id,schoolId,courseId:c.id,kind:'video',ext,contentType:mime,size,uploadedBy:admin?admin.account.id:member.member.id,createdAt:now()};db.files.push(meta);save(db);ctx.audit(admin?admin.email:member.member.email,'online.video.upload',{courseId:c.id,fileId:id,size});return ctx.send(res,201,{file:{id,url:'/api/online-learning/media/'+id,size,contentType:mime}}),true;
      }
      m = /^\/api\/online-learning\/media\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if(m&&req.method==='GET'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id,meta=db.files.find(x=>x.id===m[1]&&x.schoolId===schoolId&&['video','recording'].includes(x.kind));if(!meta)return fail(res,404,'الفيديو غير موجود.'),true;const c=getCourse(db,schoolId,meta.courseId);if(!c)return fail(res,404,'المقرر غير موجود.'),true;if(member){if(member.member.role==='student'&&(!courseVisibleTo(c,member.member)||!(db.lessons.some(l=>l.courseId===c.id&&l.status==='published'&&l.url==='/api/online-learning/media/'+meta.id)||db.recordings.some(r=>r.id===meta.id&&r.status==='published'&&r.courseId===c.id))))return fail(res,403,'هذا الفيديو غير متاح لحسابك.'),true;if(member.member.role==='teacher'&&(c.teacherId&&c.teacherId!==member.member.id||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'ليس لديك صلاحية الوصول إلى الفيديو.'),true;}const disk=path.join(fileDir,meta.id+meta.ext);if(!fs.existsSync(disk))return fail(res,404,'ملف الفيديو غير موجود على التخزين الدائم.'),true;const stat=fs.statSync(disk),range=req.headers.range;res.setHeader('Content-Type',meta.contentType);res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','private, max-age=3600');res.setHeader('X-Content-Type-Options','nosniff');if(range){const m2=/bytes=(\d*)-(\d*)/.exec(range);if(!m2)return ctx.send(res,416,{error:'نطاق الفيديو غير صالح.'}),true;let start=m2[1]?Number(m2[1]):Math.max(0,stat.size-Number(m2[2]||0)),end=m2[2]?Number(m2[2]):stat.size-1;start=Math.max(0,start);end=Math.min(stat.size-1,end);if(start>end)return ctx.send(res,416,{error:'نطاق الفيديو خارج الملف.'}),true;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1});fs.createReadStream(disk,{start,end}).pipe(res);return true;}res.writeHead(200,{'Content-Length':stat.size});fs.createReadStream(disk).pipe(res);return true;
      }
      m = /^\/api\/online-learning\/files\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if(m&&req.method==='GET'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id,meta=db.files.find(x=>x.id===m[1]&&x.schoolId===schoolId);if(!meta)return fail(res,404,'الملف غير موجود.'),true;const c=getCourse(db,schoolId,meta.courseId);if(!c)return fail(res,404,'المقرر غير موجود.'),true;if(member){if(member.member.role==='student'&&(!courseVisibleTo(c,member.member)||!db.lessons.some(l=>l.courseId===c.id&&l.status==='published'&&l.url==='/api/online-learning/files/'+meta.id)))return fail(res,403,'هذا الملف غير متاح لحسابك.'),true;if(member.member.role==='teacher'&&(c.teacherId&&c.teacherId!==member.member.id||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'ليس لديك صلاحية الوصول إلى الملف.'),true;}const disk=path.join(fileDir,meta.id+'.pdf');if(!fs.existsSync(disk))return fail(res,404,'ملف الدرس غير موجود على التخزين.'),true;const data=fs.readFileSync(disk);return ctx.send(res,200,data,'application/pdf'),true;
      }
      m = /^\/api\/online-learning\/courses\/([A-Za-z0-9_-]+)\/lessons$/.exec(pathname);
      if (m && req.method === 'POST') {
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;
        const schoolId=admin?admin.schoolId:member.school.id,c=getCourse(db,schoolId,m[1]);if(!c)return fail(res,404,'المقرر غير موجود.'),true;
        if(member&&(member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'ليست لديك صلاحية إضافة دروس إلى هذا المقرر.'),true;
        const b=await ctx.readBody(req,20000),title=str(b.title,180),type=['text','video','link','pdf'].includes(b.type)?b.type:'text';if(!title)return fail(res,400,'عنوان الدرس مطلوب.'),true;
        let url='';if(b.url){const raw=str(b.url,1000);const pdfInternal=type==='pdf'&&/^\/api\/online-learning\/files\/[A-Za-z0-9_-]+$/.test(raw);const videoInternal=type==='video'&&/^\/api\/online-learning\/media\/[A-Za-z0-9_-]+$/.test(raw)&&db.files.some(f=>f.id===raw.split('/').pop()&&f.courseId===c.id&&f.kind==='video');if(pdfInternal||videoInternal)url=raw;else{try{const u=new URL(raw);if(u.protocol!=='https:')throw 0;url=u.toString();}catch{return fail(res,400,'الرابط يجب أن يكون صالحًا ويبدأ بـ HTTPS.'),true;}}}
        if(type==='video'&&url&&!url.startsWith('/api/online-learning/media/')) { try { url=safeVideo(url); } catch(e){return fail(res,e.status||400,e.message),true;} }
        if(['video','link','pdf'].includes(type)&&!url)return fail(res,400,'أدخل رابط المحتوى المطلوب.'),true;
        if(type==='text'&&!str(b.content,12000))return fail(res,400,'أدخل شرح الدرس النصي.'),true;const lesson={id:crypto.randomUUID(),schoolId,courseId:c.id,title,type,content:str(b.content,12000),url,durationMinutes:Math.max(0,Math.min(600,Number(b.durationMinutes)||0)),order:Math.max(1,Math.min(1000,Number(b.order)||db.lessons.filter(x=>x.courseId===c.id).length+1)),status:admin&&b.publish===true?'published':'draft',createdBy:admin?admin.account.id:member.member.id,createdAt:now(),updatedAt:now()};db.lessons.push(lesson);save(db);ctx.audit(admin?admin.email:member.member.email,'online.lesson.create',{schoolId,courseId:c.id,lessonId:lesson.id,title:lesson.title,type:lesson.type,content:lesson.content,status:lesson.status});return ctx.send(res,201,{lesson}),true;
      }
      m = /^\/api\/online-learning\/lessons\/([A-Za-z0-9_-]+)\/progress$/.exec(pathname);
      if(m&&req.method==='POST'){
        const member=ctx.requireSchoolMember(req,res);if(!member)return true;if(member.member.role!=='student')return fail(res,403,'تسجيل تقدم الدروس مخصص للطالب.'),true;
        const lesson=db.lessons.find(x=>x.id===m[1]&&x.schoolId===member.school.id&&x.status==='published');if(!lesson)return fail(res,404,'الدرس غير موجود.'),true;const c=getCourse(db,member.school.id,lesson.courseId);if(!c||!courseVisibleTo(c,member.member))return fail(res,403,'هذا الدرس غير مخصص لصفك.'),true;
        let p=db.progress.find(x=>x.schoolId===member.school.id&&x.memberId===member.member.id&&x.lessonId===lesson.id);if(!p){p={id:crypto.randomUUID(),schoolId:member.school.id,memberId:member.member.id,studentName:member.member.name,courseId:c.id,lessonId:lesson.id,completedAt:now()};db.progress.push(p);}else p.completedAt=now();save(db);return ctx.send(res,200,{completed:true,completedAt:p.completedAt}),true;
      }
      m = /^\/api\/online-learning\/courses\/([A-Za-z0-9_-]+)\/assignments$/.exec(pathname);
      if(m&&req.method==='POST'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id,c=getCourse(db,schoolId,m[1]);if(!c)return fail(res,404,'المقرر غير موجود.'),true;if(member&&(member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'إضافة الواجبات لمعلم المقرر أو الإدارة.'),true;const b=await ctx.readBody(req,12000),title=str(b.title,180),description=str(b.description,4000),dueAt=str(b.dueAt,40),maxScore=Math.max(1,Math.min(1000,Number(b.maxScore)||10));if(!title)return fail(res,400,'عنوان الواجب مطلوب.'),true;if(dueAt&&Number.isNaN(Date.parse(dueAt)))return fail(res,400,'موعد التسليم غير صحيح.'),true;const item={id:crypto.randomUUID(),schoolId,courseId:c.id,title,description,dueAt,maxScore,status:admin&&b.publish===true?'published':'draft',createdBy:admin?admin.account.id:member.member.id,createdAt:now()};db.assignments.push(item);save(db);ctx.audit(admin?admin.email:member.member.email,'online.assignment.create',{schoolId,courseId:c.id,assignmentId:item.id,title:item.title,description:item.description,dueAt:item.dueAt,maxScore:item.maxScore,status:item.status});return ctx.send(res,201,{assignment:item}),true;
      }
      m = /^\/api\/online-learning\/assignments\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if(m&&req.method==='PATCH'){
        const admin=ctx.requireSchoolAdmin(req,res);if(!admin)return true;const a=db.assignments.find(x=>x.id===m[1]&&x.schoolId===admin.schoolId);if(!a)return fail(res,404,'الواجب غير موجود.'),true;const b=await ctx.readBody(req,2000);if(b.status!==undefined)a.status=b.status==='published'?'published':'draft';save(db);ctx.audit(admin.email,'online.assignment.update',{assignmentId:a.id,status:a.status});return ctx.send(res,200,{assignment:a}),true;
      }
      m = /^\/api\/online-learning\/assignments\/([A-Za-z0-9_-]+)\/submit$/.exec(pathname);
      if(m&&req.method==='POST'){
        const member=ctx.requireSchoolMember(req,res);if(!member)return true;if(member.member.role!=='student')return fail(res,403,'تسليم الواجب مخصص للطالب.'),true;const a=db.assignments.find(x=>x.id===m[1]&&x.schoolId===member.school.id&&x.status==='published');if(!a)return fail(res,404,'الواجب غير متاح.'),true;const c=getCourse(db,member.school.id,a.courseId);if(!c||!courseVisibleTo(c,member.member))return fail(res,403,'الواجب ليس مخصصًا لصفك.'),true;if(a.dueAt&&Date.parse(a.dueAt)<Date.now())return fail(res,409,'انتهى موعد تسليم الواجب.'),true;const b=await ctx.readBody(req,16000),answer=str(b.answer,12000);if(!answer)return fail(res,400,'اكتب إجابتك أو وصف الملف المرفق.'),true;let sub=db.submissions.find(x=>x.assignmentId===a.id&&x.memberId===member.member.id);if(sub&&sub.status==='graded')return fail(res,409,'تم تصحيح هذا التسليم ولا يمكن استبداله.'),true;if(!sub){sub={id:crypto.randomUUID(),schoolId:member.school.id,courseId:c.id,assignmentId:a.id,memberId:member.member.id,studentName:member.member.name,grade:member.member.grade,section:member.member.section||'',createdAt:now()};db.submissions.push(sub);}sub.answer=answer;sub.submittedAt=now();sub.status='submitted';save(db);ctx.audit(member.member.email,'online.assignment.submit',{schoolId:member.school.id,courseId:c.id,assignmentId:a.id,submissionId:sub.id,studentId:member.member.id,answer});return ctx.send(res,201,{submission:{id:sub.id,status:sub.status,submittedAt:sub.submittedAt}}),true;
      }
      m = /^\/api\/online-learning\/submissions\/([A-Za-z0-9_-]+)\/grade$/.exec(pathname);
      if(m&&req.method==='PATCH'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const sub=db.submissions.find(x=>x.id===m[1]&&(admin?x.schoolId===admin.schoolId:true));if(!sub)return fail(res,404,'التسليم غير موجود.'),true;const c=getCourse(db,sub.schoolId,sub.courseId);if(member&&(member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'تصحيح الواجب لمعلم المقرر أو الإدارة.'),true;const b=await ctx.readBody(req,3000),a=db.assignments.find(x=>x.id===sub.assignmentId),previous={score:sub.score??null,feedback:sub.feedback||'',status:sub.status};const score=Number(b.score);if(!Number.isFinite(score)||score<0||score>a.maxScore)return fail(res,400,'الدرجة خارج نطاق الدرجة النهائية للواجب.'),true;sub.score=score;sub.feedback=str(b.feedback,2000);sub.status='graded';sub.gradedAt=now();sub.gradedBy=admin?admin.account.id:member.member.id;save(db);ctx.audit(admin?admin.email:member.member.email,'online.assignment.grade',{schoolId:sub.schoolId,courseId:sub.courseId,submissionId:sub.id,studentId:sub.memberId,previous,newValue:{score,feedback:sub.feedback,status:sub.status}});return ctx.send(res,200,{submission:sub}),true;
      }
      m = /^\/api\/online-learning\/courses\/([A-Za-z0-9_-]+)\/board$/.exec(pathname);
      if(m&&(req.method==='GET'||req.method==='PUT')){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id,c=getCourse(db,schoolId,m[1]);if(!c)return fail(res,404,'المقرر غير موجود.'),true;if(member&&member.member.role==='student'&&!courseVisibleTo(c,member.member))return fail(res,403,'هذه السبورة ليست مخصصة لصفك.'),true;if(member&&member.member.role==='teacher'&&(c.teacherId&&c.teacherId!==member.member.id||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'هذه السبورة ليست ضمن إسناداتك.'),true;let board=db.boards.find(x=>x.courseId===c.id);if(req.method==='GET')return ctx.send(res,200,{board:board||{courseId:c.id,strokes:[],texts:[],updatedAt:null}}),true;if(member&&member.member.role!=='teacher')return fail(res,403,'تعديل السبورة متاح للمعلم فقط.'),true;const b=await ctx.readBody(req,180000);const strokes=Array.isArray(b.strokes)?b.strokes.slice(-1200):[],texts=Array.isArray(b.texts)?b.texts.slice(-200):[];if(JSON.stringify({strokes,texts}).length>150000)return fail(res,413,'محتوى السبورة كبير جدًا.'),true;if(!board){board={id:crypto.randomUUID(),schoolId,courseId:c.id,createdAt:now()};db.boards.push(board);}board.strokes=strokes;board.texts=texts;board.updatedAt=now();board.updatedBy=admin?admin.account.id:member.member.id;save(db);return ctx.send(res,200,{board}),true;
      }
      if(pathname==='/api/online-learning/calendar'&&req.method==='GET'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=admin?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول بحساب مدرسي أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id;let mine;if(admin)mine=db.courses.filter(c=>c.schoolId===schoolId);else if(member.member.role==='student')mine=db.courses.filter(c=>c.schoolId===schoolId&&courseVisibleTo(c,member.member));else mine=db.courses.filter(c=>c.schoolId===schoolId&&memberCanTeach(member.member,member.school,c.grade,c.subject));const ids=new Set(mine.map(c=>c.id));const events=[...db.sessions.filter(x=>ids.has(x.courseId)).map(x=>({id:x.id,type:'session',title:x.title,at:x.startsAt,courseId:x.courseId,status:x.status})),...db.assignments.filter(x=>ids.has(x.courseId)&&(admin||member.member.role!=='student'||x.status==='published')).map(x=>({id:x.id,type:'assignment',title:x.title,at:x.dueAt,courseId:x.courseId,status:x.status})),...db.quizzes.filter(x=>ids.has(x.courseId)&&(admin||member.member.role!=='student'||x.status==='published')).map(x=>({id:x.id,type:'quiz',title:x.title,at:x.opensAt,courseId:x.courseId,status:x.status}))].filter(x=>x.at).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));return ctx.send(res,200,{events}),true;
      }
      if(pathname==='/api/online-learning/parent-progress'&&req.method==='GET'){
        const parent=ctx.sessionParent?ctx.sessionParent(req):null;if(!parent)return fail(res,401,'سجّل الدخول بحساب ولي الأمر أولًا.'),true;const links=(ctx.readGuardianLinks?.().links||[]).filter(x=>x.accountId===parent.accountId&&x.status==='approved'&&x.studentId);const students=links.map(link=>{const st=ctx.readSchoolMembers().members.find(x=>x.id===link.studentId&&x.schoolId===link.schoolId&&x.role==='student'&&x.active&&x.status==='approved');if(!st)return null;const courses=db.courses.filter(c=>c.schoolId===link.schoolId&&courseVisibleTo(c,st));const ids=new Set(courses.map(c=>c.id));const progress=db.progress.filter(x=>x.schoolId===link.schoolId&&x.memberId===st.id);const assignments=db.assignments.filter(x=>ids.has(x.courseId)&&x.status==='published').map(a=>{const sub=db.submissions.find(x=>x.assignmentId===a.id&&x.memberId===st.id);return {id:a.id,title:a.title,subject:courses.find(c=>c.id===a.courseId)?.subject,dueAt:a.dueAt,status:sub?.status||'pending',score:sub?.score,maxScore:a.maxScore,feedback:sub?.feedback||''};});const attempts=db.attempts.filter(x=>x.schoolId===link.schoolId&&x.memberId===st.id&&ids.has(x.courseId)).map(x=>({quizTitle:x.quizTitle,score:x.score,max:x.max,percent:x.percent,submittedAt:x.submittedAt}));const attendance=db.attendance.filter(x=>x.schoolId===link.schoolId&&x.memberId===st.id).map(x=>({sessionId:x.sessionId,courseTitle:courses.find(c=>c.id===x.courseId)?.title,joinedAt:x.joinedAt,leftAt:x.leftAt}));return {linkId:link.id,student:{id:st.id,name:st.name,grade:st.grade,section:st.section},courses:courses.map(c=>({id:c.id,title:c.title,subject:c.subject,lessons:db.lessons.filter(l=>l.courseId===c.id&&l.status==='published').length,completed:progress.filter(p=>p.courseId===c.id).length})),assignments,attempts,attendance};}).filter(Boolean);ctx.audit(parent.accountId,'online.parent.progress.view',{studentIds:students.map(x=>x.student.id),count:students.length});return ctx.send(res,200,{students}),true;
      }
      m = /^\/api\/online-learning\/courses\/([A-Za-z0-9_-]+)\/sessions$/.exec(pathname);
      if(m&&req.method==='POST'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id,c=getCourse(db,schoolId,m[1]);if(!c)return fail(res,404,'المقرر غير موجود.'),true;
        if(member&&(member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'لا يمكنك جدولة حصة لهذا المقرر.'),true;
        const b=await ctx.readBody(req,6000),startsAt=str(b.startsAt,40),duration=Math.max(15,Math.min(180,Number(b.durationMinutes)||40)),title=str(b.title,180)||c.title;if(!startsAt||!Number.isFinite(Date.parse(startsAt)))return fail(res,400,'حدد موعدًا صحيحًا للحصة.'),true;if(Date.parse(startsAt)<Date.now()-5*60*1000)return fail(res,400,'موعد الحصة يجب أن يكون في المستقبل.'),true;
        const session={id:crypto.randomUUID(),schoolId,courseId:c.id,title,startsAt:new Date(startsAt).toISOString(),durationMinutes:duration,status:'scheduled',roomName:'taallam-'+crypto.randomBytes(18).toString('hex'),createdBy:admin?admin.account.id:member.member.id,createdByName:admin?admin.account.name:member.member.name,createdAt:now(),startedAt:null,endedAt:null};db.sessions.push(session);save(db);ctx.audit(admin?admin.email:member.member.email,'online.session.schedule',{courseId:c.id,sessionId:session.id,startsAt:session.startsAt});return ctx.send(res,201,{session}),true;
      }
      m = /^\/api\/online-learning\/sessions\/([A-Za-z0-9_-]+)\/recording$/.exec(pathname);
      if(m&&req.method==='POST'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id,session=getSession(db,schoolId,m[1]);if(!session)return fail(res,404,'الحصة غير موجودة.'),true;const c=getCourse(db,schoolId,session.courseId);if(member&&(member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'رفع تسجيل الحصة متاح لمعلم المقرر أو الإدارة.'),true;const ct=String(req.headers['content-type']||'').split(';')[0].toLowerCase(),types={'video/mp4':['.mp4','video/mp4'],'video/webm':['.webm','video/webm']};if(!types[ct]){req.resume();return fail(res,415,'صيغة التسجيل يجب أن تكون MP4 أو WebM.'),true;}const id=crypto.randomUUID(),[ext,mime]=types[ct],disk=path.join(fileDir,id+ext);const size=await writeBinaryFile(req,disk,200*1024*1024,'تسجيل الحصة');const meta={id,schoolId,courseId:c.id,sessionId:session.id,kind:'recording',ext,contentType:mime,size,uploadedBy:admin?admin.account.id:member.member.id,createdAt:now(),status:'published'};db.files.push(meta);db.recordings.push(meta);save(db);ctx.audit(admin?admin.email:member.member.email,'online.session.recording.upload',{sessionId:session.id,fileId:id,size});return ctx.send(res,201,{recording:{id,url:'/api/online-learning/media/'+id,size,contentType:mime}}),true;
      }
      m = /^\/api\/online-learning\/sessions\/([A-Za-z0-9_-]+)\/(start|end|join|leave)$/.exec(pathname);
      if(m){if(req.method!=='POST')return false;const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req),schoolId=admin?admin.schoolId:member?.school.id;if(!schoolId)return fail(res,401,'سجّل الدخول أولًا.'),true;const session=getSession(db,schoolId,m[1]);if(!session)return fail(res,404,'الحصة غير موجودة.'),true;const c=getCourse(db,schoolId,session.courseId);if(!c)return fail(res,404,'المقرر غير موجود.'),true;
        if(m[2]==='start'||m[2]==='end'){
          if(!admin&&(!member||member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'بدء الحصة وإنهاؤها للمعلم المسند أو الإدارة.'),true;
          if(m[2]==='start'){if(session.status==='ended')return fail(res,409,'انتهت هذه الحصة بالفعل.'),true;session.status='live';session.startedAt=session.startedAt||now();}
          else{session.status='ended';session.endedAt=now();for(const a of db.attendance.filter(x=>x.sessionId===session.id&&!x.leftAt))a.leftAt=session.endedAt;}
          save(db);ctx.audit(admin?admin.email:member.member.email,'online.session.'+m[2],{sessionId:session.id});return ctx.send(res,200,{session}),true;
        }
        if(!member&&!admin)return fail(res,401,'سجّل الدخول بحساب مدرسي معتمد أولًا.'),true;
        if(member&&member.member.role==='student'&&!courseVisibleTo(c,member.member))return fail(res,403,'هذه الحصة ليست مخصصة لصفك.'),true;
        if(member&&member.member.role==='teacher'&&(c.teacherId&&c.teacherId!==member.member.id||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'هذه الحصة ليست ضمن إسناداتك.'),true;
        const actor=admin?admin.account:member.member,actorId=String(actor.id||actor.email||''),actorName=String(actor.name||actor.email||'مستخدم المدرسة'),actorRole=admin?'admin':member.member.role;
        if(m[2]==='join'){
          if(session.status!=='live')return fail(res,409,session.status==='ended'?'انتهت الحصة.':'لم يبدأ المعلم الحصة بعد.'),true;
          let a=db.attendance.find(x=>x.sessionId===session.id&&x.memberId===actorId);if(!a){a={id:crypto.randomUUID(),schoolId,sessionId:session.id,courseId:c.id,memberId:actorId,memberName:actorName,role:actorRole,joinedAt:now(),leftAt:null};db.attendance.push(a);}else{a.joinedAt=now();a.leftAt=null;}save(db);if(String(process.env.MEETING_PROVIDER||'').toLowerCase()==='daily'){try{const daily=await dailyJoinData(session,actor,actorRole);save(db);return ctx.send(res,200,{...daily,attendanceId:a.id}),true;}catch(e){return fail(res,e.status||503,e.message||'تعذّر تجهيز غرفة الاجتماع.'),true;}}const configuredDomain=str(process.env.JITSI_DOMAIN||'',180).replace(/^https?:\/\//,'').replace(/\/$/,'');const selfHosted=String(process.env.JITSI_SELF_HOSTED||'0')==='1';const domain=configuredDomain||(selfHosted?'':'meet.jit.si');if(!domain||!/^[a-z0-9.-]+$/i.test(domain))return fail(res,503,selfHosted?'خادم الفصول الخاص غير مضبوط بعد. أضف اسم النطاق JITSI_DOMAIN بعد تشغيل Jitsi.':'إعداد خدمة الفصول المباشرة غير صحيح.'),true;return ctx.send(res,200,{provider:'jitsi',url:'https://'+domain+'/'+encodeURIComponent(session.roomName)+'#config.prejoinPageEnabled=true',domain,roomName:session.roomName,attendanceId:a.id,displayName:actorName,role:actorRole,publicDemo:domain==='meet.jit.si'&&!selfHosted}),true;
        }
        const a=db.attendance.find(x=>x.sessionId===session.id&&x.memberId===actorId);if(a)a.leftAt=now();save(db);return ctx.send(res,200,{left:true}),true;
      }
      m = /^\/api\/online-learning\/lessons\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if(m&&req.method==='PATCH'){
        const admin=ctx.requireSchoolAdmin(req,res);if(!admin)return true;const lesson=db.lessons.find(x=>x.id===m[1]&&x.schoolId===admin.schoolId);if(!lesson)return fail(res,404,'الدرس غير موجود.'),true;const b=await ctx.readBody(req,3000);if(b.status!==undefined)lesson.status=b.status==='published'?'published':'draft';if(b.title!==undefined)lesson.title=str(b.title,180)||lesson.title;lesson.updatedAt=now();save(db);ctx.audit(admin.email,'online.lesson.update',{lessonId:lesson.id,status:lesson.status});return ctx.send(res,200,{lesson}),true;
      }
      m = /^\/api\/online-learning\/quizzes\/([A-Za-z0-9_-]+)$/.exec(pathname);
      if(m&&req.method==='PATCH'){
        const admin=ctx.requireSchoolAdmin(req,res);if(!admin)return true;const quiz=db.quizzes.find(x=>x.id===m[1]&&x.schoolId===admin.schoolId);if(!quiz)return fail(res,404,'الاختبار غير موجود.'),true;const b=await ctx.readBody(req,3000);if(b.status!==undefined)quiz.status=b.status==='published'?'published':'draft';save(db);ctx.audit(admin.email,'online.quiz.update',{quizId:quiz.id,status:quiz.status});return ctx.send(res,200,{quiz:publicQuiz(quiz)}),true;
      }
      m = /^\/api\/online-learning\/courses\/([A-Za-z0-9_-]+)\/quizzes$/.exec(pathname);
      if(m&&req.method==='POST'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);if(!admin&&!member)return fail(res,401,'سجّل الدخول أولًا.'),true;const schoolId=admin?admin.schoolId:member.school.id,c=getCourse(db,schoolId,m[1]);if(!c)return fail(res,404,'المقرر غير موجود.'),true;if(member&&(member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'لا يمكنك إنشاء اختبار لهذا المقرر.'),true;
        const b=await ctx.readBody(req,30000),title=str(b.title,160),questions=Array.isArray(b.questions)?b.questions.slice(0,50):[];if(!title||!questions.length)return fail(res,400,'عنوان الاختبار وأسئلته مطلوبة.'),true;if(b.opensAt&&Number.isNaN(Date.parse(b.opensAt))||b.closesAt&&Number.isNaN(Date.parse(b.closesAt))||b.opensAt&&b.closesAt&&Date.parse(b.closesAt)<=Date.parse(b.opensAt))return fail(res,400,'راجع مواعيد فتح الاختبار وإغلاقه.'),true;const clean=[];for(const q of questions){const prompt=str(q.prompt,1000),options=Array.isArray(q.options)?q.options.map(x=>str(x,300)).filter(Boolean).slice(0,6):[],correctIndex=Number(q.correctIndex),points=Math.max(1,Math.min(100,Number(q.points)||1));if(!prompt||options.length<2||!Number.isInteger(correctIndex)||correctIndex<0||correctIndex>=options.length)return fail(res,400,'راجع نص كل سؤال وخياراته والإجابة الصحيحة.'),true;clean.push({id:crypto.randomUUID(),prompt,options,correctIndex,points});}
        const quiz={id:crypto.randomUUID(),schoolId,courseId:c.id,title,description:str(b.description,1000),opensAt:str(b.opensAt,40),closesAt:str(b.closesAt,40),maxAttempts:Math.max(1,Math.min(5,Number(b.maxAttempts)||1)),status:admin&&b.publish===true?'published':'draft',questions:clean,createdBy:admin?admin.account.id:member.member.id,createdAt:now()};db.quizzes.push(quiz);save(db);ctx.audit(admin?admin.email:member.member.email,'online.quiz.create',{courseId:c.id,quizId:quiz.id});return ctx.send(res,201,{quiz:publicQuiz(quiz)}),true;
      }
      m = /^\/api\/online-learning\/quizzes\/([A-Za-z0-9_-]+)\/attempt$/.exec(pathname);
      if(m&&req.method==='POST'){
        const member=ctx.requireSchoolMember(req,res);if(!member)return true;if(member.member.role!=='student')return fail(res,403,'حل الاختبار مخصص للطالب.'),true;const q=db.quizzes.find(x=>x.id===m[1]&&x.schoolId===member.school.id&&x.status==='published');if(!q)return fail(res,404,'الاختبار غير متاح.'),true;const c=getCourse(db,member.school.id,q.courseId);if(!c||!courseVisibleTo(c,member.member))return fail(res,403,'الاختبار ليس مخصصًا لصفك.'),true;const t=Date.now();if(q.opensAt&&Date.parse(q.opensAt)>t)return fail(res,409,'لم يحن موعد فتح الاختبار.'),true;if(q.closesAt&&Date.parse(q.closesAt)<t)return fail(res,409,'انتهى موعد الاختبار.'),true;const previous=db.attempts.filter(x=>x.quizId===q.id&&x.memberId===member.member.id);if(previous.length>=q.maxAttempts)return fail(res,409,'استنفدت عدد المحاولات المسموح به.'),true;const b=await ctx.readBody(req,12000),answers=b.answers&&typeof b.answers==='object'?b.answers:{};let score=0,max=q.questions.reduce((n,x)=>n+x.points,0);const detail=q.questions.map(x=>{const selected=Number(answers[x.id]);const correct=Number.isInteger(selected)&&selected===x.correctIndex;if(correct)score+=x.points;return {questionId:x.id,selected:Number.isInteger(selected)?selected:null,correct,correctIndex:x.correctIndex,points:x.points,earned:correct?x.points:0};});const attempt={id:crypto.randomUUID(),schoolId:member.school.id,courseId:c.id,quizId:q.id,quizTitle:q.title,memberId:member.member.id,studentName:member.member.name,grade:member.member.grade,section:member.member.section||'',answers:detail,score,max,percent:max?Math.round(score/max*10000)/100:0,submittedAt:now()};db.attempts.push(attempt);save(db);ctx.audit(member.member.email,'online.quiz.attempt',{schoolId:member.school.id,courseId:c.id,quizId:q.id,attemptId:attempt.id,studentId:member.member.id,answers:detail,score,max,percent:attempt.percent});return ctx.send(res,201,{attempt:{id:attempt.id,score,max,percent:attempt.percent,answers:detail}}),true;
      }
      m = /^\/api\/online-learning\/courses\/([A-Za-z0-9_-]+)\/discussions$/.exec(pathname);
      if(m&&req.method==='POST'){
        const member=ctx.requireSchoolMember(req,res);if(!member)return true;const c=getCourse(db,member.school.id,m[1]);if(!c||member.member.role==='student'&&!courseVisibleTo(c,member.member))return fail(res,403,'لا يمكنك المشاركة في هذا المقرر.'),true;const b=await ctx.readBody(req,5000),text=str(b.text,2000);if(!text)return fail(res,400,'اكتب المشاركة أولًا.'),true;const item={id:crypto.randomUUID(),schoolId:member.school.id,courseId:c.id,memberId:member.member.id,memberName:member.member.name,role:member.member.role,text,createdAt:now()};db.discussions.push(item);save(db);ctx.audit(member.member.email,'online.discussion.post',{schoolId:member.school.id,courseId:c.id,discussionId:item.id,memberId:member.member.id,role:member.member.role,text});return ctx.send(res,201,{discussion:item}),true;
      }
      m = /^\/api\/online-learning\/sessions\/([A-Za-z0-9_-]+)\/attendance$/.exec(pathname);
      if(m&&req.method==='GET'){
        const adminSession=ctx.sessionSchoolAdmin(req),admin=adminSession?ctx.requireSchoolAdmin(req,res):null;if(adminSession&&!admin)return true;const member=adminSession?null:ctx.sessionSchoolMember(req);const schoolId=admin?admin.schoolId:member?.school.id;if(!schoolId)return fail(res,401,'سجّل الدخول أولًا.'),true;const s=getSession(db,schoolId,m[1]);if(!s)return fail(res,404,'الحصة غير موجودة.'),true;const c=getCourse(db,schoolId,s.courseId);if(member&&(member.member.role!=='teacher'||(c.teacherId&&c.teacherId!==member.member.id)||!memberCanTeach(member.member,member.school,c.grade,c.subject)))return fail(res,403,'كشف الحضور متاح لمعلم المقرر وإدارة المدرسة فقط.'),true;return ctx.send(res,200,{attendance:db.attendance.filter(x=>x.sessionId===s.id)}),true;
      }
      return false;
    } catch (e) { return fail(res,e.status||400,e.message||'تعذّر تنفيذ طلب التعليم الإلكتروني.'),true; }
  }
  return { handle };
};
