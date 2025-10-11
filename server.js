
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
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

for (const d of [DATA_DIR, PUBLIC_DIR, UPLOADS_DIR]) { if (!fs.existsSync(d)) fs.mkdirSync(d, {recursive: true}); }

function readJSON(file){ try { return JSON.parse(fs.readFileSync(file,'utf8')||'null'); } catch(e){ return null; } }
function writeJSON(file,data){ fs.writeFileSync(file, JSON.stringify(data,null,2), 'utf8'); }

if (!fs.existsSync(USERS_FILE)) {
  const users = [
    { username: 'admin', passwordHash: bcrypt.hashSync('1234', 10), role: 'admin' },
    { username: 'user', passwordHash: bcrypt.hashSync('7890', 10), role: 'limited' }
  ];
  writeJSON(USERS_FILE, users);
}

if (!fs.existsSync(CONTENT_FILE)) {
  writeJSON(CONTENT_FILE, {
    hero: { title: "JTS Logistics INC", subtitle: "Truck Dispatch Service that keeps you moving & profitable",
            bullets: ["Top load sourcing & rate negotiation","Carrier packets, BOL & invoicing handled","No long-term contracts"] },
    services:[
      {title:"Load Hunting & Dispatch",text:"We find and negotiate the best loads."},
      {title:"Paperwork & Compliance",text:"Packets, COI, BOL/POD, invoicing."},
      {title:"Dedicated Support 24/7",text:"Pickups, deliveries, lumper & updates."}
    ],
    process:["Tell us your lanes","We source loads","You approve, we dispatch","Deliver & get paid"],
    pricing:[
      {name:"Owner-Operator",priceText:"7% per load"},
      {name:"Small Fleet (2–10)",priceText:"6% per load",badge:"Most Popular",featured:true},
      {name:"Custom",priceText:"Flat monthly"}
    ],
    tops:[
      {rank:"Winner", name:"—", route:"Route A → B", km:"0", image:"", video:""},
      {rank:"Silver", name:"—", route:"Route A → B", km:"0", image:"", video:""},
      {rank:"Bronze", name:"—", route:"Route A → B", km:"0", image:"", video:""}
    ],
    contact:{phone:"+1 (555) 123-4567", email:"dispatch@jtslogistics.com", location:"Nationwide"},
    footer:{brandText:"JTS Logistics INC"}, updatedAt:new Date().toISOString()
  });
}
if (!fs.existsSync(MSG_FILE)) writeJSON(MSG_FILE, []);

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_session_secret',
  resave:false, saveUninitialized:false, cookie:{ httpOnly:true, sameSite:'lax' }
}));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));

function requireAuth(req,res,next){ if(req.session && req.session.user) return next(); return res.status(401).json({ok:false,error:'Unauthorized'}); }
function isLimited(req){ return req.session?.user?.role === 'limited'; }

function makeTransporter(){
  const {EMAIL_USER, EMAIL_PASS} = process.env;
  if(!EMAIL_USER || !EMAIL_PASS) return null;
  return nodemailer.createTransport({ service:'gmail', auth:{ user:EMAIL_USER, pass:EMAIL_PASS }});
}

app.post('/api/admin/login', (req,res)=>{
  const {username,password} = req.body || {};
  const users = readJSON(USERS_FILE) || [];
  const u = users.find(x=>x.username===username);
  if(!u) return res.json({ok:false});
  if(!bcrypt.compareSync(password, u.passwordHash)) return res.json({ok:false});
  req.session.user = {username:u.username, role:u.role};
  res.json({ok:true, role:u.role});
});
app.post('/api/admin/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/admin/me',(req,res)=>{
  if(req.session && req.session.user) return res.json({ok:true, user:req.session.user});
  res.status(401).json({ok:false});
});

app.get('/api/content', (_req,res)=>res.json(readJSON(CONTENT_FILE)));
app.get('/api/admin/content', requireAuth, (_req,res)=>res.json(readJSON(CONTENT_FILE)));
app.put('/api/admin/content', requireAuth, (req,res)=>{
  const incoming = req.body || {};
  const existing = readJSON(CONTENT_FILE) || {};
  const next = isLimited(req) ? ({...existing, tops: incoming.tops || existing.tops}) : ({...existing, ...incoming});
  next.updatedAt = new Date().toISOString();
  writeJSON(CONTENT_FILE, next);
  res.json({ok:true, content: next});
});

const storage = multer.diskStorage({
  destination: (_req,_file,cb)=>cb(null, UPLOADS_DIR),
  filename: (_req,file,cb)=>cb(null, Date.now()+'_'+file.originalname.replace(/[^a-z0-9_.-]+/gi,'_'))
});
const upload = multer({ storage });

app.post('/api/contact', upload.single('cv'), async (req,res)=>{
  try{
    const {name,email,phone,message} = req.body || {};
    const msgs = readJSON(MSG_FILE) || [];
    const attachmentRel = req.file ? `/uploads/${req.file.filename}` : null;
    const entry = { fullName:name||'', email:email||'', phone:phone||'', message:message||'', attachment:attachmentRel, createdAt:new Date().toISOString() };
    msgs.push(entry); writeJSON(MSG_FILE, msgs);

    const transporter = makeTransporter();
    if(transporter && process.env.NOTIFY_TO){
      const mail = {
        from: `"JTS Logistics" <${process.env.EMAIL_USER}>`,
        to: process.env.NOTIFY_TO,
        subject: `New Driver Application - ${entry.fullName || '(no name)'}`,
        text: `New application:\\nFull Name: ${entry.fullName}\\nEmail: ${entry.email}\\nPhone: ${entry.phone}\\n\\nMessage:\\n${entry.message}`,
        attachments: []
      };
      if(req.file){
        mail.attachments.push({ filename: req.file.originalname, path: path.join(UPLOADS_DIR, req.file.filename) });
      }
      await transporter.sendMail(mail);
    }

    res.json({ok:true});
  }catch(e){
    console.error('contact error', e);
    res.status(500).json({ok:false, error:e.message});
  }
});

app.get('/api/admin/messages', requireAuth, (_req,res)=>{
  const msgs = readJSON(MSG_FILE) || [];
  res.json(msgs.sort((a,b)=> (a.createdAt < b.createdAt ? 1 : -1)));
});

const uploadTop = multer({ storage });
app.post('/api/admin/tops/:index/image', requireAuth, uploadTop.single('image'), async (req,res)=>{
  try{
    const idx = Number(req.params.index);
    if (!req.file || isNaN(idx) || idx<0 || idx>2) return res.status(400).json({ok:false, error:'Bad request'});
    const srcPath = req.file.path;
    const outName = `${Date.now()}_tops_${idx}.jpg`;
    const outPath = path.join(UPLOADS_DIR, outName);
    await sharp(srcPath).resize(1200,800,{fit:'cover'}).jpeg({quality:82}).toFile(outPath);
    if (srcPath !== outPath) { try{ fs.unlinkSync(srcPath); } catch(_){} }
    const rel = `/uploads/${outName}`;
    const c = readJSON(CONTENT_FILE) || {}; if(!Array.isArray(c.tops)) c.tops=[{},{},{}];
    const ranks=['Winner','Silver','Bronze'];
    c.tops[idx] = Object.assign({rank:ranks[idx]}, c.tops[idx], {image:rel});
    writeJSON(CONTENT_FILE, c);
    res.json({ok:true, path:rel});
  }catch(e){ console.error(e); res.status(500).json({ok:false, error:e.message}); }
});

app.get('*', (_req,res)=>res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`🚀 Running at http://localhost:${PORT}`));
