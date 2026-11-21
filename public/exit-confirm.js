/* Arabic, branded confirmation when leaving an installed app or portal with the device back button. */
(() => {
  if (window.__taallamExitGuard) return;
  window.__taallamExitGuard = true;
  let leaving = false, dialog;
  const close = () => { if (dialog) { dialog.remove(); dialog = null; } };
  const show = () => {
    if (dialog) return;
    dialog = document.createElement('div');
    dialog.dir = 'rtl';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'taExitTitle');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071b18b8;display:grid;place-items:center;padding:22px;font-family:Tahoma,Arial,sans-serif';
    dialog.innerHTML = `<section style="width:min(100%,360px);background:#fff;color:#173d32;border-radius:22px;padding:24px;text-align:center;box-shadow:0 24px 80px #0005"><div style="width:62px;height:62px;border-radius:19px;margin:0 auto 12px;background:#e8f2ec;display:grid;place-items:center;font-size:30px">📚</div><h2 id="taExitTitle" style="font-size:20px;margin:8px 0">هل تريد الخروج من تعلّم مع الهيثم؟</h2><p style="line-height:1.8;color:#64756d;margin:8px 0 20px">تأكد أنك أنهيت ما تقوم به قبل مغادرة البرنامج.</p><div style="display:flex;gap:10px"><button type="button" data-stay style="flex:1;border:0;border-radius:12px;padding:13px;background:#e7f0ea;color:#194c3b;font:inherit">البقاء في البرنامج</button><button type="button" data-leave style="flex:1;border:0;border-radius:12px;padding:13px;background:#194c3b;color:white;font:inherit">الخروج</button></div></section>`;
    document.body.append(dialog);
    dialog.querySelector('[data-stay]').onclick = () => { close(); history.pushState({ taallamGuard: true }, '', location.href); };
    dialog.querySelector('[data-leave]').onclick = () => { leaving = true; close(); history.back(); };
    dialog.querySelector('[data-stay]').focus();
  };
  history.pushState({ taallamGuard: true }, '', location.href);
  window.addEventListener('popstate', () => {
    if (leaving) return;
    show();
  });
})();
