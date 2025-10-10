const express = require('express');


const path = require('path');
const fs = require('fs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
require('dotenv').config();

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const MSG_FILE = path.join(DATA_DIR, 'messages.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Helpers
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file,'utf8')||'null'); } catch(e){ return null; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// Default users
if (!fs.existsSync(USERS_FILE)) {
  const users = [
    { username: 'admin', passwordHash: bcrypt.hashSync('1234', 10), role: 'admin' },
    { username: 'user', passwordHash: bcrypt.hashSync('7890', 10), role: 'limited' }
  ];
  writeJSON(USERS_FILE, users);
}

// Default content
if (!fs.existsSync(CONTENT_FILE)) {
  const defaultContent = {
    hero: { title: "JTS Logistics INC — Truck Dispatch", subtitle: "Loading...", bullets: ["Top load sourcing","Paperwork handled"] },
    services: [],
    process: [],
    pricing: [],
    tops: [
      { rank: "Winner", name: "—", route: "Route A → B", km: "0", image: "", video: "" },
      { rank: "Silver", name: "—", route: "Route A → B", km: "0", image: "", video: "" },
      { rank: "Bronze", name: "—", route: "Route A → B", km: "0", image: "", video: "" }
    ],
    contact: { phone: "", email: "", location: "" },
    footer: { brandText: "JTS Logistics INC" },
    updatedAt: new Date().toISOString()
  };
  writeJSON(CONTENT_FILE, defaultContent);
}
if (!fs.existsSync(MSG_FILE)) writeJSON(MSG_FILE, []);

// Middleware
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ ok:false, error: 'Unauthorized' });
}
function isLimited(req) { return req.session?.user?.role === 'limited'; }

// 🟢 LOGIN
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const users = readJSON(USERS_FILE) || [];
  const u = users.find(x => x.username === username);
  if (!u) return res.json({ ok:false });
  if (!bcrypt.compareSync(password, u.passwordHash)) return res.json({ ok:false });
  req.session.user = { username: u.username, role: u.role };
  res.json({ ok:true, role: u.role });
});

// 🟢 LOGOUT
app.post('/api/admin/logout', (req, res) => req.session.destroy(()=>res.json({ ok:true })));

// 🟢 SESSION
app.get('/api/admin/me', (req, res) => {
  if (req.session && req.session.user) return res.json({ ok:true, user: req.session.user });
  res.status(401).json({ ok:false });
});

// 🟢 CONTENT (public + admin)
app.get('/api/content', (_req, res) => res.json(readJSON(CONTENT_FILE)));
app.get('/api/admin/content', requireAuth, (_req, res) => res.json(readJSON(CONTENT_FILE)));

app.put('/api/admin/content', requireAuth, (req, res) => {
  const incoming = req.body || {};
  const existing = readJSON(CONTENT_FILE) || {};
  let next;

  if (isLimited(req)) {
    next = { ...existing, tops: incoming.tops || existing.tops };
  } else {
    next = { ...existing, ...incoming };
  }

  next.updatedAt = new Date().toISOString();
  writeJSON(CONTENT_FILE, next);
  res.json({ ok: true, content: next });
});

// 🟢 CONTACT + EMAIL
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^a-z0-9\.\-_]+/gi,'_'))
});
const upload = multer({ storage });

// 🟢 CONTACT / APPLY (form submissions with optional attachment)
const uploadContact = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const safeName = Date.now() + '_' + file.originalname.replace(/[^a-z0-9_.-]+/gi, '_');
      cb(null, safeName);
    }
  })
});

app.post('/api/contact', uploadContact.single('attachment'), async (req, res) => {
  try {
    const fullName = req.body.name?.trim() || req.body.fullName?.trim() || '(no name)';
    const { email, phone, message } = req.body;
    const file = req.file ? `/uploads/${req.file.filename}` : null;

    const msgs = readJSON(MSG_FILE) || [];
    const entry = { fullName, email, phone, message, attachment: file, createdAt: new Date().toISOString() };
    msgs.push(entry);
    writeJSON(MSG_FILE, msgs);

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.NOTIFY_TO) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      const mailOptions = {
        from: `"JTS Logistics" <${process.env.EMAIL_USER}>`,
        to: process.env.NOTIFY_TO,
        subject: `New Driver Application - ${fullName}`,
        text: `New driver application received:\n\nFull Name: ${fullName}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message}`,
        attachments: file ? [{ filename: path.basename(file), path: path.join(__dirname, 'public', file) }] : [],
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Email sent with${file ? '' : 'out'} attachment`);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('❌ contact error', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.use(express.urlencoded({ extended: true }));

// 🟢 ADMIN INBOX
app.get('/api/admin/messages', requireAuth, (_req, res) => {
  try {
    const msgs = readJSON(MSG_FILE);
    if (!msgs || !Array.isArray(msgs)) {
      console.warn('⚠️ messages.json not found or invalid');
      return res.json([]);
    }

    // Normalize
    const normalized = msgs.map(m => ({
      fullName: m.fullName || '',
      email: m.email || '',
      phone: m.phone || '',
      message: m.message || '',
      createdAt: m.createdAt ? new Date(m.createdAt) : null
    }));

    // Sort by date desc
    const sorted = normalized.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    console.log('📬 Messages loaded:', sorted.length);
    res.json(sorted);
  } catch (err) {
    console.error('❌ Error reading messages:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});



app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
// 🟢 MESSAGES + UPLOADS
app.get('/api/admin/messages', requireAuth, (_req, res) => {
  const msgs = readJSON(MSG_FILE) || [];
  res.json(msgs.sort((a,b)=> (a.createdAt < b.createdAt ? 1 : -1)));
});
// 🟢 UPLOAD TOP IMAGES (fixed version)
const uploadSingle = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, UPLOADS_DIR);
    },
    filename: function (_req, file, cb) {
      const safeName = Date.now() + '_' + file.originalname.replace(/[^a-z0-9_.-]+/gi, '_');
      cb(null, safeName);
    }
  }),
  fileFilter: function (_req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

app.post('/api/admin/tops/:index/image', requireAuth, uploadSingle.single('image'), async (req, res) => {
  try {
    const idx = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx > 2) {
      return res.status(400).json({ ok: false, error: 'Invalid index' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No image uploaded' });
    }

    const uploaded = req.file.path;
    const optimizedName = `${Date.now()}_tops_${idx}.jpg`;
    const optimizedPath = path.join(UPLOADS_DIR, optimizedName);

    // Optimize and resize
    await sharp(uploaded)
      .resize(1200, 800, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toFile(optimizedPath);

    // Delete original
    try { fs.unlinkSync(uploaded); } catch (_) {}

    // Update content.json
    const relPath = `/uploads/${optimizedName}`;
    const content = readJSON(CONTENT_FILE) || {};
    if (!Array.isArray(content.tops)) content.tops = [{}, {}, {}];
    const ranks = ['Winner', 'Silver', 'Bronze'];
    content.tops[idx] = {
      ...content.tops[idx],
      rank: ranks[idx],
      image: relPath
    };
    writeJSON(CONTENT_FILE, content);

    return res.json({ ok: true, path: relPath });
  } catch (err) {
    console.error('❌ upload error', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


app.get('*', (_req, res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`🚀 Server running on http://localhost:${PORT}`));
