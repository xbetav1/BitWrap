# 🔗 BitWrap

**BitWrap** adalah layanan proxy berbasis Express yang mengubah file media (gambar/video) menjadi **Base64** dan menyajikannya melalui **URL pendek**. Dirancang untuk otomatisasi, bot, API wrapper, dan kebutuhan integrasi lainnya.

> ⚡ **Live Demo:** [https://bit-wrap.vercel.app](https://bit-wrap.vercel.app)

---

## ✨ Fitur

- 🖼️ **Support Image & Video** (JPG, PNG, GIF, MP4, MOV, dll)
- 🔄 **Convert ke Base64** secara otomatis
- 🔗 **Short link generator** dengan format:
  - Gambar: `/x/<6digit>.png`
  - Video: `/x/<8digit>.mp4`
- 📦 **Response lengkap** (proxy URL + base64)
- 🤖 **Siap pakai untuk bot** (Telegram, Discord, WhatsApp, dll)
- 🧠 **Cache di RAM** (akses cepat tanpa penyimpanan permanen)
- 🎨 **Tampilan web interaktif** dengan loading bar & info file

---

## 🚀 Endpoint API

### `POST /upload`

Upload file dan dapatkan short link + base64.

**Request:**
```

Content-Type: multipart/form-data
file: <file binary>

```

**Response (200 OK):**
```json
{
  "proxyUrl": "/x/Ab3Xy9.png",
  "base64": "data:image/png;base64,iVBORw0KGgo..."
}
```

Contoh cURL:

```bash
curl -X POST https://bit-wrap.vercel.app/upload \
  -F "file=@gambar.jpg"
```

---

🤖 Contoh Integrasi Bot

Python (requests)

```python
import requests

url = "https://bit-wrap.vercel.app/upload"
with open("foto.jpg", "rb") as f:
    res = requests.post(url, files={"file": f})
    data = res.json()
    short_url = "https://bit-wrap.vercel.app" + data["proxyUrl"]
    print(short_url)
```

Node.js (axios)

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const form = new FormData();
form.append('file', fs.createReadStream('video.mp4'));

axios.post('https://bit-wrap.vercel.app/upload', form, {
  headers: form.getHeaders()
}).then(res => {
  console.log('Proxy:', 'https://bit-wrap.vercel.app' + res.data.proxyUrl);
});
```

Telegram Bot (Python)

```python
async def handle_document(update, context):
    file = await update.message.document.get_file()
    file_path = await file.download_to_drive()
    
    with open(file_path, 'rb') as f:
        res = requests.post('https://bit-wrap.vercel.app/upload', files={'file': f})
    
    short_url = "https://bit-wrap.vercel.app" + res.json()['proxyUrl']
    await update.message.reply_text(f"✅ Proxy: {short_url}")
```

---

🧪 Teknologi

· Runtime: Node.js
· Framework: Express.js
· Storage: In-memory cache (1 jam, hilang saat cold start)
· Deploy: Vercel (serverless)

⚠️ Catatan: Karena Vercel serverless bersifat ephemeral, file cache akan hilang saat cold start atau redeploy. Untuk penyimpanan permanen, disarankan pindah ke Render, Railway, atau VPS.

---

📁 Struktur Proyek

```
bitwrap/
├── index.js          # Server & API handler
├── public/
│   └── index.html    # Web interface
├── package.json      # Dependencies
└── vercel.json       # Vercel config
```

---

🛠️ Instalasi Lokal

```bash
git clone https://github.com/username/bitwrap.git
cd bitwrap
npm install
npm start
```

Buka http://localhost:3000

---

📄 Lisensi

MIT © 2025 BitWrap

---

🙋 Kontribusi

Pull request dipersilakan. Untuk bug atau saran, buka issue di repository ini.
