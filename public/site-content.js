// ---------- MAP & VIDEO HELPERS ----------
function mapLinkForRoute(route) {
  const q = encodeURIComponent(route || '');
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function videoIdFromUrl(url = '') {
  try {
    if (!url) return null;
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    const v = u.searchParams.get('v');
    if (v) return v;
    const m = url.match(/embed\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return null;
  } catch (_) {
    return null;
  }
}

function embedUrlFromVideoLink(link) {
  const vid = videoIdFromUrl(link || '') || '';
  if (!vid) return '';
  return `https://www.youtube.com/embed/${vid}?playlist=${vid}&autoplay=1&mute=1&loop=1&controls=0&modestbranding=1&rel=0&playsinline=1`;
}

// ---------- IMAGE MODAL (POPUP) ----------
function mountImageModal() {
  const modal = document.getElementById('imgModal');
  const modalImg = document.getElementById('modalImg');
  const closeBtn = document.getElementById('modalClose');

  function open(src) {
    modalImg.src = src;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function close() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modalImg.src = '';
  }

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { open, close };
}
const modalApi = mountImageModal();
// ---------- ROUTE IMAGE MODAL ----------
function mountRouteModal() {
  const modal = document.getElementById('routeModal');
  const modalImg = document.getElementById('routeImg');
  const closeBtn = document.getElementById('routeClose');

  function open(src) {
    modalImg.src = src;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function close() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modalImg.src = '';
  }

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  return { open, close };
}

const routeModalApi = mountRouteModal();
function openRouteModal(src) {
  routeModalApi.open(src);
}


// ---------- TOP CARDS RENDER ----------
function renderTops(tops) {
  const wrap = document.getElementById('tops-wrapper');
  if (!wrap) return;
  wrap.innerHTML = '';

  const order = ['Winner', 'Silver', 'Bronze'];
  const byRank = {};
  (tops || []).forEach(t => byRank[t.rank] = t);

  order.forEach(rank => {
    const t = byRank[rank] || { name: '—', route: '', km: '', image: '', video: '' };
    const cls = rank.toLowerCase();
    const card = document.createElement('div');
    card.className = `top-card ${cls}`;

    // Winner confetti animation
    if (rank === 'Winner') {
      const c = document.createElement('div');
      c.className = 'confetti';
      for (let i = 0; i < 18; i++) {
        const s = document.createElement('span');
        s.style.left = (Math.random() * 100) + '%';
        s.style.animationDelay = (Math.random() * 2) + 's';
        s.style.opacity = (0.6 + Math.random() * 0.4).toFixed(2);
        c.appendChild(s);
      }
      card.appendChild(c);
    }

    // ---------- MEDIA (Image + Hover Video) ----------
    const media = document.createElement('div');
    media.className = 'media';

    // Photo
    const img = document.createElement('img');
    img.className = 'photo';
    img.alt = `${rank} photo`;
    img.src = t.image && t.image.trim() !== '' ? t.image : '/assets/placeholder.jpg';
    img.addEventListener('click', () => modalApi.open(img.src));

    // Video Overlay
    const iframe = document.createElement('iframe');
    iframe.className = 'yt-top';
    iframe.src = embedUrlFromVideoLink(t.video || '');
    iframe.setAttribute('title', `${rank} video`);
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'autoplay; encrypted-media');
    iframe.loading = 'lazy';
    iframe.allowFullscreen = true;

    media.appendChild(img);
    media.appendChild(iframe);
    card.appendChild(media);

    // ---------- BODY ----------
   const body = document.createElement('div');
body.innerHTML = `
  <div class="rank">
    ${rank === 'Winner' ? '🥇 Winner' : rank === 'Silver' ? '🥈 Silver' : '🥉 Bronze'}
  </div>
  <div class="name">${t.name || '—'}</div>
  <div class="meta">Route: ${t.route || '—'} · ${t.km || ''} miles</div>
  <button class="view-route-btn" data-img="${t.routeImage || ''}">View Route</button>
  ${rank === 'Winner'
    ? `<button class="view-pay-btn" onclick="window.open('/uploads/Unit 812 Driver_Pay_Report.pdf', '_blank')">View Driver Pay</button>`
    : ''
  }
`;



    card.appendChild(body);

    wrap.appendChild(card);
	// View Route image on click
card.querySelector('.view-route-btn').addEventListener('click', (e) => {
  const imgUrl = e.target.getAttribute('data-img');
  if (!imgUrl) {
    alert('No route image available.');
    return;
  }
  openRouteModal(imgUrl);
});

  });
}

// ---------- LOAD SITE CONTENT ----------
async function loadContent() {
  try {
    const res = await fetch('/api/content');
    if (!res.ok) throw new Error('Content fetch failed');
    const c = await res.json();

    // HERO
   

    // SERVICES
    const sc = document.getElementById('services-cards');
    sc.innerHTML = '';
    (c.services || []).forEach(s => {
      const el = document.createElement('article');
      el.className = 'card';
      el.innerHTML = `<h3>${s.title || ''}</h3><p>${s.text || ''}</p>`;
      sc.appendChild(el);
    });

    // PROCESS
    const ps = document.getElementById('process-steps');
    ps.innerHTML = '';
    (c.process || []).forEach((txt, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${i + 1}</span> ${txt}`;
      ps.appendChild(li);
    });

   

    // ---------- MODAL ----------
    const modal = document.getElementById('priceModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalText = document.getElementById('modalText');
    const closeModal = document.getElementById('closeModal');

    function openPriceModal(title, text) {
      modalTitle.innerHTML = title;
      modalText.innerHTML = text;
      modal.classList.add('open');
    }

    closeModal.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

    // ---------- TOPS ----------
    renderTops(c.tops);

    // ---------- CONTACT ----------
    document.getElementById('contact-phone').textContent = `📞 ${c.contact?.phone || ''}`;
    document.getElementById('contact-email').textContent = `✉️ ${c.contact?.email || ''}`;
    document.getElementById('contact-location').textContent = `📍 ${c.contact?.location || ''}`;
  } catch (e) {
    console.error('Content load error', e);
  }
}

loadContent();
window.addEventListener('load', () => {
  // Осигури дека содржината се прикажува правилно по вчитување
  const activeSection = window.location.hash || '#hero';
  showSection(activeSection);
});
