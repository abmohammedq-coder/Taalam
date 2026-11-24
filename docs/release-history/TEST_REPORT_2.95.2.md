# تقرير اختبارات الإصدار 2.95.2

## اختبارات الأكاديميات والدرجات
- `academics-check.js`: 107/107 ناجحة.
- تشمل: رفض الدرجة الزائدة مع اسم الطالب، مطابقة العام القديم `2026` مع `2026-2027` في التقرير والشهادة، منع المواد غير المقررة، صلاحيات المعلم، كشف الدرجات، الشهادات.

## بقية الاختبارات المنفذة منفردة
- `online-learning-ui-check.js`: 10/10.
- `school-permissions-check.js`: 51 assertion.
- `member-permissions-check.js`: 19 assertion.
- `voice-check.js`: 6/6.
- `learn-check.js`: 13/13.
- `pdf-smoke-check.js`: 120/120.
- `http-smoke-check.js`: 17/17.
- `learn-api-check.js`: 26/26.
- `features-check.js`: 95/95.
- `bookjobs-check.js`: 44/44.
- `sims-check.js`: 58/58.
- `advanced-check.js`: 7/7.
- `ui-check.js`: 55/55.
- `workflow-ui-check.js`: 51/51.
- `online-learning-check.js`: ناجح.

## التحقق البرمجي
- `node --check server.js`: ناجح.
- `node --check lib/extras.js`: ناجح.
- فحص JavaScript المضمن في `school-admin.html` و`school.html` و`online-learning.html`: ناجح.
- `node --check public/teachers-ui.js`: ناجح.

## حدود الاختبارات
- تم تشغيل مجموعات الاختبارات منفردة؛ تشغيل `npm test` دفعة واحدة تجاوز مهلة التنفيذ الإجمالية، لذلك لا نسجل ادعاء نجاح تشغيل موحد كامل.
- اختبارات PDF وHTTP تستخدم محلل PDF تجريبيًا في بيئة الاختبار؛ لا تثبت OCR حقيقيًا على كل الملفات.
- لم يتم اختبار النشر على Railway أو الاتصال بخادم Jitsi/Jibri حقيقي أو اختبار بصري على هاتف فعلي.
