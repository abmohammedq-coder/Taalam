# تقرير اختبارات 2.95.19

## اختبارات الإصدار
- meeting-check: 8/8 assertions.
- archive-check: 32 assertions.
- awareness: 6/6.
- online-learning server checks: passed.
- online-learning UI: 13/13.
- school permissions: 51 assertions.
- member permissions: 19 assertions.
- student/guardian permissions: 29 assertions.
- voice: 10/10.
- learn library: 13/13.
- PDF/source checks: 120/120.
- HTTP integration: 28/28.
- learn API: 26/26.
- features: 95/95.
- book jobs: 44/44.
- simulations: 60/60.
- advanced: 7/7.
- UI wiring: 58/58.
- workflow UI: 53/53.
- academics: 118/118 (شُغّلت منفردة).
- transcript fail-circle: passed (شُغّل منفردًا).

## ملاحظة عن التشغيل الموحد
شُغّل `npm test`، واجتازت المجموعات حتى workflow UI (53/53)، لكن التشغيل الموحد تجاوز مهلة بيئة التنفيذ قبل إكمال آخر مجموعتين. شُغّلت الأكاديميات (118/118) وفحص دائرة الرسوب منفصلين واجتازا. لذلك لا نصف التشغيل الموحد بأنه اكتمل.

## حدود الاختبار
- لا يوجد اختبار صوت/فيديو حي بين جهازين فعليين؛ يلزم اختباره بعد النشر من هاتفين أو متصفحين على شبكتين.
- لم يتم نشر الإصدار على Railway.
- لا يوجد تسجيل تلقائي Jibri في هذا الإصدار.
- PDF التقارير لا يزال يعتمد على طباعة المتصفح وحفظ PDF.
