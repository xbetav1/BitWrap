import multer from "multer";
import crypto from "crypto";

// Store di global supaya bisa diakses antar request (masih riskan di Vercel)
// Tapi ini solusi terbaik tanpa database eksternal
const globalStore = global._bitwrapStore || new Map();
global._bitwrapStore = globalStore;

function randomId(len) {
    return crypto.randomBytes(len).toString("hex").slice(0, len);
}

function isValidFile(mimetype) {
    return mimetype.startsWith("image/") || mimetype.startsWith("video/");
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
    // Set CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    
    const url = req.url || "";
    
    // ========== HANDLE GET = short link ==========
    if (req.method === "GET") {
        // Extract ID dari /s/abc123.png atau /s/abc123
        let match = url.match(/\/s\/([^\/?#]+)/);
        if (match) {
            let id = match[1];
            if (id && id.includes(".")) {
                id = id.split(".")[0];
            }
            
            console.log("GET Shortlink - ID:", id);
            
            const file = globalStore.get(id);
            
            if (!file) {
                return res.status(404).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>File Not Found</title></head>
                    <body style="background:#0b0b12;color:white;text-align:center;padding:50px;font-family:Arial">
                        <h1>404 - File Not Found</h1>
                        <p>File sudah expired atau tidak ditemukan.</p>
                        <a href="/" style="color:#6a00ff">Kembali ke Home</a>
                    </body>
                    </html>
                `);
            }
            
            // Cek expiry
            if (file.expiryTime && Date.now() > file.expiryTime) {
                globalStore.delete(id);
                return res.status(410).send(`
                    <!DOCTYPE html>
                    <html>
                    <head><title>File Expired</title></head>
                    <body style="background:#0b0b12;color:white;text-align:center;padding:50px;font-family:Arial">
                        <h1>410 - File Expired</h1>
                        <p>File sudah melewati batas waktu penyimpanan.</p>
                        <a href="/" style="color:#6a00ff">Kembali ke Home</a>
                    </body>
                    </html>
                `);
            }
            
            const buffer = Buffer.from(file.data, "base64");
            res.setHeader("Content-Type", file.type);
            res.setHeader("Cache-Control", "public, max-age=3600");
            return res.send(buffer);
        }
        
        // Jika bukan shortlink, lanjut ke static file
        return res.status(404).send("Not found");
    }
    
    // ========== HANDLE POST = upload file ==========
    if (req.method === "POST") {
        try {
            await runMiddleware(req, res, upload.single("file"));
            
            if (!req.file) {
                return res.status(400).json({ error: "No file uploaded" });
            }
            
            if (!isValidFile(req.file.mimetype)) {
                return res.status(400).json({ error: "Invalid file type. Only images and videos allowed" });
            }
            
            const duration = req.body.duration || "24h";
            const isImage = req.file.mimetype.startsWith("image");
            const ext = isImage ? "png" : "mp4";
            const id = randomId(isImage ? 8 : 6);
            const base64 = req.file.buffer.toString("base64");
            const expiryTime = getExpiryTime(duration);
            
            const fileData = {
                data: base64,
                type: req.file.mimetype,
                createdAt: Date.now(),
                duration: duration,
                expiryTime: expiryTime,
                size: req.file.size,
                filename: req.file.originalname
            };
            
            globalStore.set(id, fileData);
            console.log("Stored ID:", id, "Store size:", globalStore.size);
            
            // Schedule deletion
            if (expiryTime !== null) {
                const delay = expiryTime - Date.now();
                if (delay > 0 && delay < 30 * 24 * 60 * 60 * 1000) { // Max 30 days
                    setTimeout(() => {
                        if (globalStore.has(id)) {
                            globalStore.delete(id);
                            console.log(`File ${id} deleted after expiry`);
                        }
                    }, delay);
                }
            }
            
            const shortLink = `/s/${id}.${ext}`;
            const fullUrl = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers["host"]}${shortLink}`;
            
            return res.status(200).json({
                success: true,
                id: id,
                shortLink: shortLink,
                fullUrl: fullUrl,
                filename: req.file.originalname,
                size: req.file.size,
                type: req.file.mimetype,
                duration: duration,
                expiresAt: expiryTime ? new Date(expiryTime).toISOString() : "never",
                createdAt: new Date().toISOString(),
                // API endpoint untuk convert (sama dengan endpoint ini)
                apiEndpoint: `/api/convert`
            });
            
        } catch (error) {
            console.error("Error:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }
    
    return res.status(405).json({ error: "Method not allowed" });
}