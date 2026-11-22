#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const required = [
  "'roster.read'", "'roster.write'", "'members.read'", "'members.review'", "'members.assign'", "'settings.read'", "'settings.write'",
  "'finance.read'", "'finance.write'", "'results.read'", "'results.write'", "'attendance.read'",
  "'attendance.write'", "'schedule.read'", "'schedule.write'", "'certificates.read'", "'certificates.write'",
  "'guardians.read'", "'guardians.write'", "'reports.read'", "'archives.read'", "'archives.write'",
  "'submissions.read'", "'submissions.grade'"
];
for (const key of required) assert(source.includes(key), `Missing permission key: ${key}`);
assert(source.includes("pathname==='/api/school-admin/permissions'&&req.method==='PUT'"), 'Principal permission-management endpoint missing');
assert(source.includes("school.permission.denied"), 'Denied actions must be audited');
assert(source.includes('if(b.accountId){const target=(school.admins||[]).find(a=>a.id===String(b.accountId)&&a.active&&a.schoolRole===\'deputy\')'), 'Per-account permission updates must target an active deputy in the same school');
assert(source.includes('school.account.permissions.update'), 'Per-account permission changes must be audited');
assert(source.includes('target.permissions=Object.fromEntries([...valid].map(key=>[key,selected.has(key)]))'), 'Per-account permissions must persist explicit grants and denials');
assert(source.includes("schoolRole==='deputy'"), 'Individual permission assignment cannot target the principal');
assert(source.includes("a.active!==false"), 'Permission account list exposes active state for filtering');
const start = source.indexOf('const SCHOOL_DEPUTY_BASE_READS =');
const end = source.indexOf('function publicSchool(', start);
assert(start >= 0 && end > start, 'Could not isolate permission policy implementation');
const sandbox = { URL, Date };
const policy = vm.runInNewContext(source.slice(start, end) + ';({schoolPermissionFor,schoolAccountCan})', sandbox);
const { schoolPermissionFor, schoolAccountCan } = policy;
const req = (method, url) => ({ method, url });
assert.strictEqual(schoolPermissionFor(req('GET','/api/school-admin/members')), 'members.read');
assert.strictEqual(schoolPermissionFor(req('POST','/api/school-admin/members/review')), 'members.review');
assert.strictEqual(schoolPermissionFor(req('POST','/api/school-admin/members/assign')), 'members.assign');
assert.strictEqual(schoolPermissionFor(req('PUT','/api/school-admin/settings')), 'settings.write');
assert.strictEqual(schoolPermissionFor(req('POST','/api/school-admin/fees/payment')), 'finance.write');
assert.strictEqual(schoolPermissionFor(req('GET','/api/school-admin/results/report')), 'results.read');
assert.strictEqual(schoolPermissionFor(req('POST','/api/school-admin/attendance')), 'attendance.write');
assert.strictEqual(schoolPermissionFor(req('POST','/api/school-admin/roster')), 'roster.write');
const principal = { account:{schoolRole:'principal'}, school:{} };
assert.strictEqual(schoolAccountCan(principal,'school.manage'), true);
const deputy = { account:{id:'d1',schoolRole:'deputy'}, school:{delegation:{deputyId:'d1',expiresAt:new Date(Date.now()+60000).toISOString(),permissions:['members.read','members.review']}} };
assert.strictEqual(schoolAccountCan(deputy,'members.review'), true);
const deputyWithoutDelegation={account:{id:'d2',schoolRole:'deputy'},school:{}};
assert.strictEqual(schoolAccountCan(deputyWithoutDelegation,'session.read'),true);
assert.strictEqual(schoolAccountCan(deputyWithoutDelegation,'settings.read'),true);
assert.strictEqual(schoolAccountCan(deputyWithoutDelegation,'settings.write'),false);
const narrowDeputy={account:{id:'d3',schoolRole:'deputy'},school:{deputyPermissions:['members.review'],delegation:{deputyId:'d3',expiresAt:new Date(Date.now()+60000).toISOString(),permissions:['members.review']}}};
assert.strictEqual(schoolAccountCan(narrowDeputy,'settings.read'),true,'Dashboard base read access remains available');
assert.strictEqual(schoolAccountCan(narrowDeputy,'results.read'),false,'Unselected sensitive read scopes remain denied');
assert.strictEqual(schoolAccountCan(deputy,'settings.write'), false);
deputy.account.permissions={'members.review':false,'settings.read':true};
assert.strictEqual(schoolAccountCan(deputy,'members.review'), false, 'Explicit deny must override grant');
assert.strictEqual(schoolAccountCan(deputy,'settings.read'), true, 'Explicit per-account grant should allow a configured permission');
deputy.school.delegation.expiresAt=new Date(Date.now()-1000).toISOString();
deputy.account.permissions['settings.write']=true;
assert.strictEqual(schoolAccountCan(deputy,'settings.write'), false, 'Expired delegation must deny even an explicit write grant');
console.log(`school-permissions-check: ${required.length + 27} assertions passed`);
