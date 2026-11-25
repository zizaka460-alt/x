const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  console.error('Задай пароль: переменная окружения ADMIN_PASSWORD');
  process.exit(1);
}

const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const DB = path.join(DATA, 'tracks.json');
fs.mkdirSync(UPLOADS, { recursive: true });

const loadTracks = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return []; } };
const saveTracks = (t) => fs.writeFileSync(DB, JSON.stringify(t, null, 2));

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

// проверка пароля
function auth(req, res, next) {
  const given = req.get('x-admin-password') || '';
  if (crypto.timingSafeEqual(sha(given), sha(PASSWORD))) return next();
  setTimeout(() => res.status(401).json({ error: 'Неверный пароль' }), 700);
}

const ALLOWED = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) =>
      cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 МБ
  fileFilter: (req, file, cb) =>
    cb(null, ALLOWED.includes(path.extname(file.originalname).toLowerCase()))
});

const app = express();

app.get('/api/tracks', (req, res) => res.json(loadTracks()));

app.get('/api/check', auth, (req, res) => res.json({ ok: true }));

app.post('/api/tracks', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Нужен аудиофайл (mp3, wav, ogg, flac, m4a)' });
  const title = String(req.body.title || req.file.originalname).slice(0, 100);
  const track = { id: path.parse(req.file.filename).name, title, file: req.file.filename, date: Date.now() };
  const tracks = loadTracks();
  tracks.push(track);
  saveTracks(tracks);
  res.json(track);
});

app.delete('/api/tracks/:id', auth, (req, res) => {
  const tracks = loadTracks();
  const t = tracks.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Не найдено' });
  fs.unlink(path.join(UPLOADS, t.file), () => {});
  saveTracks(tracks.filter((x) => x.id !== t.id));
  res.json({ ok: true });
});

app.use('/uploads', express.static(UPLOADS));
app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 50 МБ' : 'Ошибка загрузки' });
});

app.listen(PORT, () => console.log('Сайт: http://localhost:' + PORT));
