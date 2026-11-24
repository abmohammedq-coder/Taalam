# تقرير التحقق — 2.94.6

| مجموعة الاختبار | النتيجة |
|---|---:|
| workflow-ui-check | 44/44 |
| academics-check | 97/97 |
| source checks (pdf-smoke-check) | 119/119 |
| http-smoke-check | 17/17 |
| voice-check | 6/6 |
| syntax: server.js, lib/extras.js, inline school-admin/school scripts | ناجح |

ملاحظة: شُغّل `npm test` كسلسلة موحدة، وتجاوزت الجلسة مهلة التنفيذ بعد اجتياز مجموعات الصلاحيات والصوت والتعلم وPDF وHTTP وميزات المنصة. أُعيد تشغيل مجموعتي سير العمل والاختبارات الأكاديمية منفصلتين واكتملتا بنجاح. لم يتم اختبار النشر على Railway أو تجربة واجهات الهاتف الفعلية في هذا التقرير.
