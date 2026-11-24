'use strict';
const fs=require('fs');const assert=require('assert');
const page=fs.readFileSync('public/online-learning.html','utf8');
const guardian=fs.readFileSync('public/guardian.html','utf8');
const tests=[
 ['online learning has a digital whiteboard panel',page.includes('id="panel-board"')&&page.includes('id="whiteboard"')],
 ['whiteboard persists through the course board API',page.includes('/board',{method:'PUT'})||page.includes("+'/board'" )],
 ['whiteboard strokes auto-save and students refresh the shared board every two seconds',page.includes('boardSaveQueue')&&page.includes('saveBoard()')&&page.includes('},2000)')],
 ['lesson editor accepts local MP4 and WebM uploads',page.includes('name="videoFile"')&&page.includes('video/mp4,video/webm')],
 ['class session recording upload is explicitly available',page.includes('id="recordingForm"')&&page.includes('/recording')],
 ['recording UI explains that automatic recording requires Jibri',page.includes('Jibri')],
 ['assignments can be created, submitted and graded',page.includes('id="assignmentForm"')&&page.includes('/submit')&&page.includes('/grade')],
 ['academic calendar includes sessions, assignments and quizzes',page.includes('id="panel-calendar"')&&page.includes('/api/online-learning/calendar')],
 ['parent portal loads linked child online-learning progress',guardian.includes('/api/online-learning/parent-progress')&&guardian.includes('online-progress')],
 ['student, teacher and school admin portals link to online learning',fs.readFileSync('public/student-school.html','utf8').includes('/online-learning/')&&fs.readFileSync('public/teacher.html','utf8').includes('/online-learning/')&&fs.readFileSync('public/school-admin.html','utf8').includes('/online-learning/')],
 ['teacher and school admin have an explicit start-audio-video control',page.includes('بدء الحصة بالصوت والصورة')&&page.includes('فتح غرفة الحصة')],
 ['students have a clear join-audio-video control and device permission guidance',page.includes('دخول الحصة بالصوت والصورة')&&page.includes('الميكروفون والكاميرا')],
 ['teacher start opens the meeting window during the user gesture to avoid popup blocking',page.includes("const meetingWindow=action==='start'?window.open('about:blank','_blank'):null")&&page.includes('joinSession(id,meetingWindow)')],
];
for(const [name,ok] of tests){console.log((ok?'PASS ':'FAIL ')+name);assert.ok(ok,name)}
console.log(`${tests.length}/${tests.length} online-learning UI checks passed.`);
