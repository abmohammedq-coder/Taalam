# تقرير اختبارات الإصدار 2.94.7

## الاختبارات المنفذة منفردة
- school-permissions-check: 51 assertion passed.
- member-permissions-check: 19 assertion passed.
- voice-check: 6/6.
- learn-check: 13/13.
- pdf-smoke-check: 44/44.
- http-smoke-check: 17/17.
- learn-api-check: 26/26.
- features-check: 95/95.
- bookjobs-check: 44/44.
- sims-check: 58/58.
- advanced-check: 7/7.
- ui-check: 55/55.
- workflow-ui-check: 45/45.
- academics-check: 97/97.

## ملاحظات
- شُغّلت مجموعات الاختبار منفردة؛ لا أصف تشغيل أمر npm test الموحد بأنه اكتمل في عملية واحدة.
- تم فحص صياغة JavaScript المضمنة في صفحتي المدرسة وإدارة المدرسة باستخدام `node --check`.
- تم فحص سلامة أرشيف ZIP بعد إنشائه.
- لم يتم اختبار النشر على Railway أو تجربة هاتف فعلي.
