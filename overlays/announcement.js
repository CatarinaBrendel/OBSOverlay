(function(){
  const el = document.getElementById('announce');
  if (!el) return;

  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function markdownToHtml(s){
    if (!s) return '';
    // escape first
    const escaped = escapeHtml(s);
    // paragraphs: split on two or more newlines
    const paras = escaped.split(/\n{2,}/g).map(p=>{
      // single newlines -> <br>
      let line = p.replace(/\n/g, '<br>');
      // bold: **text** (non-greedy)
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      // italic: *text* (avoid interfering with bold)
      line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
      return `<p>${line}</p>`;
    });
    return paras.join('');
  }

  function show(text){
    if (!text || !text.trim()){
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    // make announcement persistent: show until a clear message is received
    // legacy path: if HTML is provided it will be handled in message handler.
    el.innerHTML = markdownToHtml(text.trim());
    el.classList.remove('hidden');
  }

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}`;
  let ws;
  try{
    ws = new WebSocket(url);
  }catch(e){
    console.warn('Announcement WS failed, no connection', e);
    return;
  }

  ws.addEventListener('open', ()=>{});
  ws.addEventListener('message', (ev)=>{
    try{
      const msg = JSON.parse(ev.data);
      if (!msg) return;
      if (msg.type === 'announcement') {
        // If an HTML payload is provided, sanitize and render it. Otherwise use legacy markdown/text.
        if (msg.html) {
          try {
            // DOMPurify is loaded in announcement.html
            // allow style and class attributes so Quill's size classes survive
            const temp = DOMPurify.sanitize(msg.html, { ALLOWED_ATTR: ['style', 'class'] });
            // post-process to keep only font-size from inline styles, keep classes intact
            const wrapper = document.createElement('div');
            wrapper.innerHTML = temp;
            const nodes = wrapper.querySelectorAll('[style]');
            nodes.forEach(n => {
              try {
                const fs = n.style.getPropertyValue('font-size');
                if (fs) n.style.cssText = `font-size: ${fs};`;
                else n.removeAttribute('style');
              } catch (e) { n.removeAttribute('style'); }
            });
            el.innerHTML = wrapper.innerHTML;
            el.classList.remove('hidden');
          } catch (e) {
            console.warn('DOMPurify not available, falling back to text', e);
            show(msg.text || '');
          }
        } else {
          show(msg.text || '');
        }
        const align = (msg.align && ['left','center','right'].includes(msg.align)) ? msg.align : 'center';
        el.classList.remove('align-left','align-center','align-right');
        el.classList.add(`align-${align}`);
      }
      if (msg.type === 'reload') location.reload();
    }catch(e){ console.error('Invalid WS message', e); }
  });

  ws.addEventListener('close', ()=>{});
  ws.addEventListener('error', (e)=>{ console.warn('Announcement WS error', e); });
})();
