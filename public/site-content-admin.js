// ---------- API WRAPPER ----------
async function api(path, opts = {}) {
  opts.credentials = 'include';
  if (!opts.headers) opts.headers = {};
  if (opts.body && !(opts.body instanceof FormData))
    opts.headers['Content-Type'] = 'application/json';
  const res = await fetch(path, opts);
  if (res.status === 401) throw new Error('Unauthorized');
  return res.json();
}

document.getElementById('login')?.addEventListener('click', async () => {
  const u = document.getElementById('u').value;
  const p = document.getElementById('p').value;
  const note = document.getElementById('login-note');
  try {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
    if (r.ok) { note.textContent='✅ Logged in'; bootAdmin(r.role); await loadAll(); }
    else note.textContent='❌ Invalid credentials';
  } catch { note.textContent='⚠️ Login failed'; }
});

document.getElementById('logout')?.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  location.reload();
});

function hideForLimited() { /* keep everything visible for admin */ }
async function bootAdmin(role) {
  document.getElementById('login-box').style.display='none';
  document.getElementById('editor').style.display='block';
  document.getElementById('role-pill').textContent=`Role: ${role}`;
}

async function loadAll() {
  try {
    const c = await api('/api/admin/content'); window.CMS_CONTENT = c;
    (c.tops||[]).forEach((t,i)=>{
      const id=`tops.${i}`;
      const set=(k,v)=>{ const el=document.getElementById(`${id}.${k}`); if(!el)return; if(el.tagName==='IMG') el.src=v||''; else el.value=v||''; };
      set('name',t.name); set('route',t.route); set('km',t.km); set('video',t.video); set('preview',t.image);
    });
    await loadInbox();
  } catch(e){ console.error('loadAll',e); }
}

async function loadInbox(){
  const tbody = document.getElementById('inbox'); if(!tbody) return;
  const msgs = await api('/api/admin/messages'); tbody.innerHTML='';
  if(!msgs.length){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="6" style="text-align:center;color:#888;">No messages</td>'; tbody.appendChild(tr); return; }
  msgs.forEach(m=>{
    const tr=document.createElement('tr'); const view = m.attachment ? `<a href="${m.attachment}" target="_blank" rel="noopener">📎 View</a>` : '—';
    tr.innerHTML = `<td>${m.fullName||'(no name)'}</td><td>${m.email||''}</td><td>${m.phone||''}</td>
      <td>${(m.message||'').replace(/</g,'&lt;')}</td><td>${m.createdAt?new Date(m.createdAt).toLocaleString():''}</td><td>${view}</td>`;
    tbody.appendChild(tr);
  });
}

document.addEventListener('click', async (e)=>{
  if(e.target.classList.contains('upload')){
    const idx=e.target.dataset.index; const f=document.getElementById(`tops.${idx}.image`);
    if(!f.files.length) return alert('Choose image');
    const fd=new FormData(); fd.append('image', f.files[0]);
    const r = await fetch(`/api/admin/tops/${idx}/image`,{method:'POST',body:fd,credentials:'include'}).then(r=>r.json());
    if(r.ok){ document.getElementById(`tops.${idx}.preview`).src=r.path; alert('✅ Uploaded'); } else alert('❌ Upload failed');
  }
});

document.getElementById('save')?.addEventListener('click', async ()=>{
  const tops=[0,1,2].map(i=>({
    rank:['Winner','Silver','Bronze'][i],
    name:document.getElementById(`tops.${i}.name`).value,
    route:document.getElementById(`tops.${i}.route`).value,
    km:document.getElementById(`tops.${i}.km`).value,
    video:document.getElementById(`tops.${i}.video`).value,
    image:document.getElementById(`tops.${i}.preview`).src||''
  }));
  const payload={...window.CMS_CONTENT, tops};
  const res=await api('/api/admin/content',{method:'PUT',body:JSON.stringify(payload)});
  if(res.ok){ alert('✅ Saved'); document.getElementById('sitePreview').contentWindow.location.reload(); } else alert('❌ Save error');
});

(async()=>{
  const me=await fetch('/api/admin/me',{credentials:'include'}).then(r=>r.json()).catch(()=>({ok:false}));
  if(me.ok){ bootAdmin(me.user.role); await loadAll(); }
})(); 
