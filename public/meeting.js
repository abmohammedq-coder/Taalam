/* Temporary Jitsi Meet integration for pilot classrooms. Public meet.jit.si is not production hosting. */
'use strict';
(() => {
  let api = null, dailyCall = null, scriptPromise = null, scriptDomain = '', loadedDomain = '', dailyPromise = null, active = false;
  const $ = id => document.getElementById(id);
  const shell = $('meetingShell'), frame = $('meetingFrame'), error = $('meetingError');
  function loadApi(domain) {
    if (window.JitsiMeetExternalAPI && loadedDomain === domain) return Promise.resolve();
    if (scriptPromise) return scriptDomain === domain ? scriptPromise : Promise.reject(new Error('غيّر خادم الاجتماع؛ أعد تحميل صفحة التعليم الإلكتروني قبل الانضمام.'));
    scriptDomain = domain;
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = 'https://' + domain + '/external_api.js'; s.async = true;
      s.onload = () => { if (window.JitsiMeetExternalAPI) { loadedDomain = domain; resolve(); } else { scriptPromise = null; reject(new Error('تعذّر تحميل واجهة الاجتماع.')); } };
      s.onerror = () => { scriptPromise = null; reject(new Error('تعذّر الاتصال بخدمة الاجتماع. تحقق من الإنترنت ثم أعد المحاولة.')); };
      document.head.appendChild(s);
    });
    return scriptPromise;
  }
  function loadDaily() {
    if (window.DailyIframe) return Promise.resolve();
    if (dailyPromise) return dailyPromise;
    dailyPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = 'https://unpkg.com/@daily-co/daily-js'; s.async = true;
      s.onload = () => window.DailyIframe ? resolve() : reject(new Error('تعذّر تحميل واجهة Daily.'));
      s.onerror = () => { dailyPromise = null; reject(new Error('تعذّر الاتصال بخدمة Daily. تحقق من الإنترنت ثم أعد المحاولة.')); };
      document.head.appendChild(s);
    });
    return dailyPromise;
  }
  function close() {
    active = false;
    try { if (api) api.dispose(); } catch (_) {}
    try { if (dailyCall) dailyCall.destroy(); } catch (_) {}
    api = null; dailyCall = null; frame.replaceChildren(); shell.classList.remove('open'); document.body.style.overflow = '';
  }
  $('meetingClose').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && active) close(); });
  window.TAALLAM_MEETING = {
    async open(data) {
      if (!data || !/^([a-z0-9-]+\.)*[a-z0-9-]+$/i.test(String(data.domain || '')) || !/^[a-z0-9-]{12,120}$/i.test(String(data.roomName || ''))) throw new Error('بيانات غرفة الاجتماع غير صالحة.');
      close(); active = true; shell.classList.add('open'); document.body.style.overflow = 'hidden';
      $('meetingTitle').textContent = 'الحصة المباشرة — ' + String(data.displayName || 'مشارك').slice(0, 80);
      $('meetingWarning').textContent = data.provider === 'daily' ? 'وضع تجريبي عبر Daily. الحساب المجاني يتضمن 10,000 دقيقة مشارك شهريًا؛ الخدمة طرف ثالث ولا يتوفر تسجيل تلقائي ضمن هذا الإعداد. لا تشارك معلومات شخصية حساسة.' : data.publicDemo ? 'وضع تجريبي: الاتصال يمر عبر meet.jit.si العامة. قد تظهر الخدمة للمشاركين، ولا يوجد تسجيل تلقائي أو ضمان خصوصية مؤسسية. لا تشارك معلومات حساسة.' : 'اتصال عبر خادم الفصول المضبوط للمنصة. تأكد من سياسة الخصوصية وإعدادات الخادم.';
      $('meetingExternal').href = data.url; $('meetingExternal').hidden = false; error.textContent = 'جارٍ تجهيز غرفة الاجتماع…';
      try {
        if (data.provider === 'daily') {
          if (!/^https:\/\/[a-z0-9.-]+\.daily\.co\/[a-z0-9_-]+$/i.test(String(data.url||'')) || typeof data.token !== 'string' || data.token.length < 20) throw new Error('بيانات غرفة Daily غير صالحة.');
          await loadDaily(); if (!active) return;
          dailyCall = window.DailyIframe.createFrame(frame,{showLeaveButton:true,showFullscreenButton:true,iframeStyle:{width:'100%',height:'100%',minHeight:'320px',border:0,display:'block'}});
          dailyCall.on('joined-meeting',async()=>{error.textContent='تم الاتصال. جارٍ تشغيل الكاميرا…';try{await dailyCall.setLocalVideo(true);error.textContent='تم الاتصال. إذا لم تظهر الصورة، تحقق من إذن الكاميرا في المتصفح.';}catch(cameraErr){error.textContent='تم دخول الاجتماع، لكن تعذّر تشغيل الكاميرا. اسمح للمتصفح بالكاميرا ثم أعد تشغيلها من أدوات الاجتماع.';console.warn('Daily setLocalVideo failed',cameraErr);}});
          dailyCall.on('camera-error',e=>{error.textContent='تعذّر تشغيل الكاميرا. تحقق من إذن الكاميرا، وأنها غير مستخدمة في تطبيق آخر.';console.warn('Daily camera error',e);});
          dailyCall.on('camera-started',()=>{error.textContent='';});
          dailyCall.on('left-meeting',()=>{if(active)error.textContent='تم مغادرة غرفة الاجتماع. يمكنك إغلاق النافذة أو إعادة فتح الحصة.';});
          dailyCall.on('error',e=>{error.textContent='حدث خطأ في غرفة Daily. يمكنك فتح الرابط في نافذة مستقلة.';console.warn('Daily meeting error',e);});
          await dailyCall.join({url:data.url,token:data.token});
        } else {
          await loadApi(data.domain); if (!active) return;
          api = new window.JitsiMeetExternalAPI(data.domain, { roomName:data.roomName,parentNode:frame,width:'100%',height:'100%',lang:'ar',userInfo:{displayName:String(data.displayName||'مشارك').slice(0,80)},configOverwrite:{prejoinPageEnabled:true,startWithAudioMuted:data.role==='student',startWithVideoMuted:true,disableDeepLinking:true} });
          api.addListener('videoConferenceJoined',()=>{error.textContent='';});
          api.addListener('readyToClose',close);
          api.addListener('errorOccurred',e=>{error.textContent='حدث خطأ في غرفة الاجتماع. يمكنك فتح الرابط في نافذة مستقلة.';console.warn('Jitsi meeting error',e);});
        }
      } catch(e) { error.textContent=e.message||'تعذّر فتح الاجتماع.'; $('meetingExternal').hidden=false; }
    }, close
  };
})();
