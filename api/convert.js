import multer from "multer";
import crypto from "crypto";

const store = new Map();

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
    console.log("Method:", req.method, "URL:", url);
    
    // HANDLE GET PROXY - ambil file dari store
    if (req.method === "GET") {
        // Extract ID dari URL: /x/BitWrap/1a54c859cd.png
        let match = url.match(/\/x\/BitWrap\/([^\/?#]+)/);
        if (!match) {
            match = url.match(/\/api\/convert\/([^\/?#]+)/);
        }
        
        if (match) {
            let id = match[1];
            if (id && id.includes(".")) {
                id = id.split(".")[0];
            }
            
            console.log("GET Proxy - Extracted ID:", id);
            
            const file = store.get(id);
            
            if (!file) {
                console.log("File not found in store. Available IDs:", Array.from(store.keys()));
                return res.status(404).send("File not found or expired");
            }
            
            const buffer = Buffer.from(file.data, "base64");
            res.setHeader("Content-Type", file.type);
            res.setHeader("Cache-Control", "public, max-age=3600");
            return res.send(buffer);
        }
        
        // Jika bukan proxy request, return 404
        return res.status(404).send("Not found");
    }
    
    // HANDLE POST UPLOAD
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
            const id = randomId(isImage ? 10 : 8);
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
            
            store.set(id, fileData);
            console.log("File stored with ID:", id, "Store size:", store.size);
            
            if (expiryTime !== null) {
                const delay = expiryTime - Date.now();
                if (delay > 0) {
                    setTimeout(() => {
                        if (store.has(id)) {
                            store.delete(id);
                            console.log(`File ${id} deleted after expiry`);
                        }
                    }, delay);
                }
            }
            
            const proxyUrl = `/x/BitWrap/${id}.${ext}`;
            
            return res.status(200).json({
                success: true,
                id: id,
                link: proxyUrl,
                base64: base64.substring(0, 100) + "...",
                fullBase64: base64,
                type: req.file.mimetype,
                size: req.file.size,
                filename: req.file.originalname,
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