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

// ---------- LOGIN / LOGOUT ----------
document.getElementById('login')?.addEventListener('click', async () => {
  const u = document.getElementById('u').value;
  const p = document.getElementById('p').value;
  const note = document.getElementById('login-note');
  try {
    const r = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: p }),
    });
    if (r.ok) {
      note.textContent = '✅ Logged in successfully';
      bootAdmin(r.role);
      await loadAll();
    } else note.textContent = '❌ Invalid credentials';
  } catch (e) {
    note.textContent = '⚠️ Login failed';
  }
});

document.getElementById('logout')?.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  location.reload();
});

// ---------- ROLE HANDLING ----------
function hideForLimited() {
  const restricted = [
    'heroSection',
    'servicesSection',
    'processSection',
    'pricingSection',
    'contactSection',
    'usersSection'
  ];
  restricted.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

async function bootAdmin(role) {
  document.getElementById('login-box').style.display = 'none';
  document.getElementById('editor').style.display = 'block';
  document.getElementById('role-pill').textContent = `Role: ${role}`;
  if (role === 'user') hideForLimited();
}

async function loadAdminContent() {
  try {
    const res = await fetch('/api/admin/content');
    if (!res.ok) throw new Error('Failed to load content');
    const c = await res.json();

    // HERO
    document.getElementById('hero-admin-title').textContent = c.hero?.title || '';
    document.getElementById('hero-admin-subtitle').textContent = c.hero?.subtitle || '';

    // SERVICES
    const svcWrap = document.getElementById('services-admin');
    svcWrap.innerHTML = '';
    (c.services || []).forEach(s => {
      const div = document.createElement('div');
      div.className = 'admin-card';
      div.innerHTML = `<b>${s.title}</b><br>${s.text}`;
      svcWrap.appendChild(div);
    });

    // PROCESS
    const procWrap = document.getElementById('process-admin');
    procWrap.innerHTML = '';
    (c.process || []).forEach((p, i) => {
      const li = document.createElement('li');
      li.textContent = `${i + 1}. ${p}`;
      procWrap.appendChild(li);
    });

    // PRICING
    const priceWrap = document.getElementById('pricing-admin');
    priceWrap.innerHTML = '';
    (c.pricing || []).forEach(p => {
      const div = document.createElement('div');
      div.className = 'admin-card';
      div.innerHTML = `<b>${p.name}</b> — ${p.priceText}`;
      priceWrap.appendChild(div);
    });

    // CONTACT INFO
    document.getElementById('contact-admin').innerHTML = `
      📞 ${c.contact?.phone || ''}<br>
      ✉️ ${c.contact?.email || ''}<br>
      📍 ${c.contact?.location || ''}
    `;

  } catch (err) {
    console.error('Admin content load error:', err);
  }
}
loadAdminContent();

// ---------- LOAD CONTENT + INBOX ----------
async function loadAll() {
  try {
    const c = await api('/api/admin/content');
    window.CMS_CONTENT = c;

    // Load TOPS
    (c.tops || []).forEach((t, i) => {
      const idPrefix = `tops.${i}`;
      const get = (x) => document.getElementById(`${idPrefix}.${x}`);
      if (get('name')) get('name').value = t.name || '';
      if (get('route')) get('route').value = t.route || '';
      if (get('km')) get('km').value = t.km || '';
      if (get('video')) get('video').value = t.video || '';
      if (get('preview')) get('preview').src = t.image || '';
    });

    // Load Inbox
    await loadInbox();
  } catch (e) {
    console.error('Error loading content', e);
  }
}

// ---------- LOAD INBOX ----------
async function loadInbox() {
  try {
    const tbody = document.getElementById('inbox');
    if (!tbody) return;
    const msgs = await api('/api/admin/messages');
    tbody.innerHTML = '';

    if (!msgs.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" style="text-align:center;color:#888;">No messages found</td>`;
      tbody.appendChild(tr);
      return;
    }

    msgs.forEach((msg) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${msg.fullName || '(no name)'}</td>
        <td>${msg.email || ''}</td>
        <td>${msg.phone || ''}</td>
        <td>${(msg.message || '').replace(/</g, '&lt;')}</td>
        <td>${new Date(msg.createdAt).toLocaleString()}</td>
        <td>
          ${
            msg.attachment
              ? `<a href="${msg.attachment}" target="_blank" rel="noopener" style="color:#00A6A6;font-weight:600;">📎 View</a>`
              : '—'
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('Error loading inbox', e);
  }
}


// ---------- IMAGE UPLOAD ----------
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('upload')) {
    const idx = e.target.dataset.index;
    const f = document.getElementById(`tops.${idx}.image`);
    if (!f.files.length) return alert('Choose image first');
    const fd = new FormData();
    fd.append('image', f.files[0]);
    const res = await fetch(`/api/admin/tops/${idx}/image`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    const j = await res.json();
    if (j.ok) {
      document.getElementById(`tops.${idx}.preview`).src = j.path;
      alert('✅ Image uploaded');
    } else alert('❌ Upload failed');
  }
});

// ---------- SAVE CHANGES ----------
document.getElementById('save')?.addEventListener('click', async () => {
  const tops = [0, 1, 2].map(i => ({
    rank: ['Winner', 'Silver', 'Bronze'][i],
    name: document.getElementById(`tops.${i}.name`).value,
    route: document.getElementById(`tops.${i}.route`).value,
    km: document.getElementById(`tops.${i}.km`).value,
    video: document.getElementById(`tops.${i}.video`).value,
    image: document.getElementById(`tops.${i}.preview`).src || '',
  }));
  const payload = { ...window.CMS_CONTENT, tops };
  const res = await api('/api/admin/content', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    alert('✅ Saved successfully');
    const frame = document.getElementById('sitePreview');
    if (frame) frame.contentWindow.location.reload();
  } else alert('❌ Save error');
});

// ---------- INIT ----------
(async function init() {
  try {
    const me = await fetch('/api/admin/me', { credentials: 'include' })
      .then(r => r.json())
      .catch(() => ({ ok: false }));
    if (me.ok) {
      bootAdmin(me.user.role);
      await loadAll();
    }
  } catch (e) {
    console.error('Init error', e);
  }
})();
