#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const extras=fs.readFileSync(path.join(__dirname,'..','lib','extras.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','public','school-admin.html'),'utf8');
for(const key of ['teacher.overview','teacher.results.read','teacher.results.write','teacher.results.update','teacher.results.delete','teacher.notes.read','teacher.notes.write'])assert(server.includes(`'${key}'`),`Missing server permission ${key}`);
assert(server.includes("pathname==='/api/school-admin/member-permissions'&&req.method==='GET'"),'GET member permission endpoint missing');
assert(server.includes("pathname==='/api/school-admin/member-permissions'&&req.method==='PUT'"),'PUT member permission endpoint missing');
assert(server.includes("x.schoolId===ss.schoolId&&x.role==='teacher'&&x.status==='approved'&&x.active!==false"),'Member permission scope must be active teachers in this school');
assert(server.includes("ss.account.schoolRole!=='principal'"),'Only principal may administer member permissions');
assert(server.includes("school.member.permissions.update"),'Permission changes must be audited');
for(const key of ['teacher.overview','teacher.results.read','teacher.results.write','teacher.results.update','teacher.results.delete','teacher.notes.read','teacher.notes.write'])assert(extras.includes(`'${key}'`),`Teacher endpoint does not enforce ${key}`);
assert(extras.includes("me.permissions[key] === true"),'Explicit per-account permissions must be enforced');
assert(extras.includes("canTeach(me, school, grade, subject)"),'Teacher assignment scope must remain enforced');
assert(ui.includes('teacherPermissionsCard')&&ui.includes('/api/school-admin/member-permissions'),'School admin UI missing teacher permission editor');
console.log('member-permissions-check: 19 assertions passed');
