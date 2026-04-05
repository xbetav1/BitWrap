const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const storage = new Map();

app.post('/upload', (req, res) => {
  const { file, filename, type } = req.body;

  if (!file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const isVideo = type?.startsWith('video/') || filename?.match(/\.(mp4|mov|avi|mkv|webm)$/i);
  const isImage = type?.startsWith('image/') || filename?.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i);

  if (!isVideo && !isImage) {
    return res.status(400).json({ error: 'Only image or video files are allowed' });
  }

  const idLength = isVideo ? 8 : 6;
  const ext = isVideo ? '.mp4' : '.png';
  let id;
  do {
    id = uuidv4().replace(/-/g, '').substring(0, idLength);
  } while (storage.has(id));

  let base64Data = file;
  if (file.includes(',')) {
    base64Data = file.split(',')[1];
  }

  const buffer = Buffer.from(base64Data, 'base64');
  storage.set(id, {
    buffer: buffer,
    mimeType: type || (isVideo ? 'video/mp4' : 'image/png'),
    ext: ext
  });

  setTimeout(() => storage.delete(id), 3600000);

  const proxyUrl = `/x/${id}${ext}`;
  res.json({
    proxyUrl: proxyUrl,
    base64: file.substring(0, 100) + '...'
  });
});

app.get('/x/:id', (req, res) => {
  const param = req.params.id;
  const id = param.replace(/\.(png|mp4)$/, '');
  const data = storage.get(id);

  if (data) {
    res.setHeader('Content-Type', data.mimeType);
    res.send(data.buffer);
  } else {
    res.status(404).send('File not found or expired');
  }
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;