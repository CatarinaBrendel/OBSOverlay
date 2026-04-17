(function(){
  const el = document.getElementById('lobby');
  if (!el) return;

  function sanitizeAndShow(id) {
    try {
      const safe = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(String(id)) : String(id).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      if (!safe || safe.trim() === '') {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
      }
      el.innerHTML = `<div class="id">${safe}</div>`;
      el.classList.remove('hidden');
    } catch (e) { console.error('Lobby render error', e); }
  }

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}`;
  let ws;
  try { ws = new WebSocket(url); } catch (e) { console.warn('Lobby WS failed', e); return; }

  ws.addEventListener('open', ()=>{});
  ws.addEventListener('message', (ev)=>{
    try {
      const msg = JSON.parse(ev.data);
      if (!msg) return;
      if (msg.type === 'lobby') {
        sanitizeAndShow(msg.id || '');
      }
      if (msg.type === 'reload') location.reload();
    } catch (e) { console.error('Invalid WS message', e); }
  });

  ws.addEventListener('close', ()=>{ ws = null; setTimeout(()=>{ try{ location.reload(); }catch(e){} }, 1500); });
})();
