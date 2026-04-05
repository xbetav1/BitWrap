import multer from "multer";
import crypto from "crypto";

// Global store untuk nyimpen Data URL (Vercel serverless tetap riskan)
// Tapi ini solusi terbaik tanpa database
const globalStore = global._bitwrapStore || new Map();
global._bitwrapStore = globalStore;

function randomId(len) {
    return crypto.randomBytes(len).toString("hex").slice(0, len);
}

function getExpiryTime(duration) {
    const now = Date.now();
    switch(duration) {
        case "24h": return now + (24 * 60 * 60 * 1000);
        case "7d": return now + (7 * 24 * 60 * 60 * 1000);
        case "30d": return now + (30 * 24 * 60 * 60 * 1000);
        case "forever": return null;
        default: return now + (24 * 60 * 60 * 1000);
    }
}

const upload = multer({ 
    limits: { fileSize: 500 * 1024 * 1024 },
    storage: multer.memoryStorage()
});

function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    
    const url = req.url || "";
    
    // ========== HANDLE GET = short link redirect ke Data URL ==========
    if (req.method === "GET") {
        let match = url.match(/\/s\/([^\/?#]+)/);
        if (match) {
            let id = match[1];
            if (id && id.includes(".")) {
                id = id.split(".")[0];
            }
            
            console.log("GET Shortlink - ID:", id);
            
            const data = globalStore.get(id);
            
            if (!data) {
                return res.status(404).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Link Expired</title>
                    <style>body{background:#0a0a0f;color:white;text-align:center;padding:50px;font-family:Arial}</style>
                    </head>
                    <body>
                        <h1>🔗 Link Expired</h1>
                        <p>Link sudah kadaluarsa atau tidak ditemukan.</p>
                        <a href="/" style="color:#6a00ff">Buat Link Baru</a>
                    </body>
                    </html>
                `);
            }
            
            // Cek expiry
            if (data.expiryTime && Date.now() > data.expiryTime) {
                globalStore.delete(id);
                return res.status(410).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>Link Expired</title>
                    <style>body{background:#0a0a0f;color:white;text-align:center;padding:50px;font-family:Arial}</style>
                    </head>
                    <body>
                        <h1>⏰ Link Expired</h1>
                        <p>Link sudah melewati batas waktu yang ditentukan.</p>
                        <a href="/" style="color:#6a00ff">Buat Link Baru</a>
                    </body>
                    </html>
                `);
            }
            
            // Redirect ke Data URL
            console.log("Redirecting to Data URL, length:", data.dataUrl.length);
            return res.redirect(302, data.dataUrl);
        }
        
        return res.status(404).send("Not found");
    }
    
    // ========== HANDLE POST = upload file → Data URL → short link ==========
    if (req.method === "POST") {
        try {
            await runMiddleware(req, res, upload.single("file"));
            
            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded" });
            }
            
            const isImage = req.file.mimetype.startsWith("image");
            const duration = req.body.duration || "24h";
            
            // STEP 1: Convert ke Base64
            const base64 = req.file.buffer.toString("base64");
            
            // STEP 2: Buat Data URL panjang
            const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
            
            // STEP 3: Buat ID unik untuk short link
            const id = randomId(6);
            const ext = isImage ? "png" : "mp4";
            const expiryTime = getExpiryTime(duration);
            
            // STEP 4: Simpan Data URL ke store dengan ID
            globalStore.set(id, {
                dataUrl: dataUrl,
                mimeType: req.file.mimetype,
                filename: req.file.originalname,
                size: req.file.size,
                createdAt: Date.now(),
                expiryTime: expiryTime,
                duration: duration
            });
            
            console.log("Stored ID:", id, "Store size:", globalStore.size);
            
            // Schedule deletion
            if (expiryTime !== null) {
                const delay = expiryTime - Date.now();
                if (delay > 0 && delay < 30 * 24 * 60 * 60 * 1000) {
                    setTimeout(() => {
                        if (globalStore.has(id)) {
                            globalStore.delete(id);
                            console.log(`ID ${id} deleted after expiry`);
                        }
                    }, delay);
                }
            }
            
            // STEP 5: Buat short link
            const shortLink = `/s/${id}.${ext}`;
            const fullShortLink = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["host"]}${shortLink}`;
            
            return res.status(200).json({
                success: true,
                id: id,
                shortLink: shortLink,
                fullUrl: fullShortLink,
                dataUrl: dataUrl.substring(0, 100) + "... (truncated)",
                fullDataUrl: dataUrl,
                filename: req.file.originalname,
                size: req.file.size,
                mimeType: req.file.mimetype,
                duration: duration,
                expiresAt: expiryTime ? new Date(expiryTime).toISOString() : "never",
                createdAt: new Date().toISOString()
            });
            
        } catch (error) {
            console.error("Error:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }
    
    return res.status(405).json({ error: "Method not allowed" });
}