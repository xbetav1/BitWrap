const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uid = require('uid-safe');
const mime = require('mime-types');

const app = express();
const upload = multer({ dest: '/tmp/uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const proxyDir = '/tmp/proxy';
if (!fs.existsSync(proxyDir)) fs.mkdirSync(proxyDir, { recursive: true });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileBuffer = fs.readFileSync(req.file.path);
  const mimeType = req.file.mimetype;
  const isVideo = mimeType.startsWith('video/');
  const isImage = mimeType.startsWith('image/');

  if (!isVideo && !isImage) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Only image or video files are allowed' });
  }

  const ext = isVideo ? '.mp4' : '.png';
  const idLength = isVideo ? 8 : 6;
  let id;
  let filePath;
  do {
    id = uid.sync(idLength);
    filePath = path.join(proxyDir, `${id}${ext}`);
  } while (fs.existsSync(filePath));

  fs.writeFileSync(filePath, fileBuffer);
  fs.unlinkSync(req.file.path);

  const proxyUrl = `/x/${id}${ext}`;
  const base64 = fileBuffer.toString('base64');
  
  res.json({ proxyUrl, base64: base64.substring(0, 100) + '...' });
});

app.get('/x/:id', (req, res) => {
  const filePath = path.join(proxyDir, req.params.id);
  if (fs.existsSync(filePath)) {
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.status(404).send('File not found');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;