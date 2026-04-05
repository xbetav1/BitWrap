import multer from "multer";
import crypto from "crypto";

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
        case "24h": return now + 24 * 60 * 60 * 1000;
        case "7d":  return now + 7 * 24 * 60 * 60 * 1000;
        case "30d": return now + 30 * 24 * 60 * 60 * 1000;
        case "forever": return null;
        default: return now + 24 * 60 * 60 * 1000;
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
            resolve(result);
        });
    });
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();

    const url = req.url || "";

    // ==================== GET → Short Link ====================
    if (req.method === "GET") {
        // Ambil ID dari /s/abc123 atau /s/abc123.png
        const match = url.match(/\/s\/([a-f0-9]+)/i);
        const id = match ? match[1] : null;

        console.log("=== SHORTLINK DEBUG ===");
        console.log("URL:", url);
        console.log("Extracted ID:", id);
        console.log("Total files in store:", globalStore.size);
        console.log("Available IDs:", Array.from(globalStore.keys()));

        if (!id) {
            return res.status(404).send("Not found");
        }

        const file = globalStore.get(id);

        if (!file) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html><head><title>404 Not Found</title></head>
                <body style="background:#0b0b12;color:white;text-align:center;padding:80px;font-family:Arial">
                    <h1>404 - File Not Found</h1>
                    <p>File ini sudah expired atau tidak ditemukan.</p>
                    <a href="/" style="color:#6a00ff">← Kembali ke Home</a>
                </body></html>
            `);
        }

        // Cek expired
        if (file.expiryTime && Date.now() > file.expiryTime) {
            globalStore.delete(id);
            return res.status(410).send("File Expired");
        }

        const buffer = Buffer.from(file.data, "base64");
        res.setHeader("Content-Type", file.type);
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.send(buffer);
    }

    // ==================== POST → Upload ====================
    if (req.method === "POST") {
        try {
            await runMiddleware(req, res, upload.single("file"));

            if (!req.file) return res.status(400).json({ error: "No file uploaded" });
            if (!isValidFile(req.file.mimetype)) {
                return res.status(400).json({ error: "Only images and videos allowed" });
            }

            const duration = req.body.duration || "24h";
            const isImage = req.file.mimetype.startsWith("image");
            const ext = isImage ? "png" : "mp4";
            const id = randomId(isImage ? 8 : 6);

            const fileData = {
                data: req.file.buffer.toString("base64"),
                type: req.file.mimetype,
                createdAt: Date.now(),
                duration,
                expiryTime: getExpiryTime(duration),
                size: req.file.size,
                filename: req.file.originalname
            };

            globalStore.set(id, fileData);

            // Auto delete kalau ada expiry
            if (fileData.expiryTime) {
                const delay = fileData.expiryTime - Date.now();
                if (delay > 0) {
                    setTimeout(() => globalStore.delete(id), delay);
                }
            }

            const shortLink = `/s/\( {id}. \){ext}`;

            return res.status(200).json({
                success: true,
                shortLink,
                filename: req.file.originalname,
                size: req.file.size,
                type: req.file.mimetype,
                duration,
                expiresAt: fileData.expiryTime ? new Date(fileData.expiryTime).toISOString() : "never",
                createdAt: new Date().toISOString()
            });

        } catch (error) {
            console.error("Upload Error:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: "Method not allowed" });
}