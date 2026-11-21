'use strict';
const fs=require('fs'),os=require('os'),path=require('path');
const create=require('../lib/interactives');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'taallam-advanced-'));
const file=path.join(dir,'book-interactives.json');
const readJsonFile=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}};
const saveJsonFile=(f,d)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d))};
const app=create({dataDir:dir,readJsonFile,saveJsonFile,learn:{normalizeArabic:s=>String(s)}});
const book={id:'moon-book',title:'علوم الفضاء',pages:40};
const checks=[];const ck=(label,ok)=>checks.push([label,!!ok]);
try{
  let failed=false;try{app.create({bookId:book.id,template:'guided_inquiry',pages:[5],params:{topic:'القمر'}},book)}catch{failed=true}
  ck('custom inquiry refuses incomplete content',failed);
  const item=app.create({bookId:book.id,template:'guided_inquiry',title:'استكشاف سطح القمر والأقمار الصناعية',pages:[5,6],params:{topic:'استكشاف سطح القمر والأقمار الصناعية',objective:'يفسر الطالب خصائص سطح القمر ودور الأقمار الصناعية.',materials:['صور سطح القمر','نموذج كرة','مصدر معلومات موثوق'],steps:['لاحظ الفوهات والسهول في صور سطح القمر.','قارن بين سطح القمر وسطح الأرض.','ارسم مسار قمر صناعي حول الأرض.'],questions:['لماذا تظهر الفوهات على سطح القمر؟','كيف تساعد الأقمار الصناعية في الاتصالات؟'],expectedObservation:'تظهر فوهات كثيرة على سطح القمر، وتدور الأقمار الصناعية في مدارات حول الأرض.',safetyNote:'استخدم مصادر علمية موثوقة ولا تنظر مباشرة إلى الشمس.'}},book);
  ck('free-topic experiment is stored and linked to the selected book pages',item.status==='needs_review'&&item.bookId===book.id&&item.pages.join(',')==='5,6'&&item.params.topic.includes('القمر'));
  ck('students cannot see a custom inquiry before administration approval',app.approvedFor(book.id).length===0);
  const approved=app.setStatus(item.id,'approved','school-admin@example.invalid');
  ck('administration approval runs custom inquiry checks and publishes it',approved.status==='approved'&&approved.checks.every(x=>x.ok)&&app.approvedFor(book.id).length===1);
  const view=app.publicView(approved,new Map([[book.id,book]]));
  ck('student-facing custom inquiry includes its source, procedure, questions and safety note',view.params.steps.length===3&&view.params.questions.length===2&&view.params.safetyNote.length>0&&view.pages[0]===5);
  const edited=app.update(item.id,{title:'استكشاف القمر الصناعي',pages:[7],params:{...item.params,topic:'استكشاف القمر الصناعي',pages:[7]}},book);
  ck('editing a custom inquiry moves it back to review and changes the book reference',edited.status==='needs_review'&&edited.pages[0]===7&&app.approvedFor(book.id).length===0);
  const reapproved=app.setStatus(item.id,'approved','school-admin@example.invalid');
  ck('students see the edited inquiry again only after a second administration approval',reapproved.status==='approved'&&app.approvedFor(book.id).length===1);
}catch(e){console.error(e.stack||e);process.exitCode=1}
let bad=0;for(const [label,ok] of checks){console.log((ok?'PASS ':'FAIL ')+label);if(!ok)bad++}console.log(`\n${checks.length-bad}/${checks.length} advanced checks passed.`);if(bad)process.exitCode=1;fs.rmSync(dir,{recursive:true,force:true});
