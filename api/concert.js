import multer from "multer";
import crypto from "crypto";

// In-memory store (Vercel serverless = ephemeral)
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

// Configure multer for Vercel
const upload = multer({ 
    limits: { fileSize: 500 * 1024 * 1024 },
    storage: multer.memoryStorage()
});

// Helper to run middleware
function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
}

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    
    // Handle proxy GET request
    if (req.method === "GET") {
        const pathParts = req.url.split("/");
        let id = pathParts[pathParts.length - 1];
        if (id && id.includes(".")) {
            id = id.split(".")[0];
        }
        
        console.log("Proxy request for ID:", id);
        
        const file = store.get(id);
        
        if (!file) {
            return res.status(404).send("File not found or expired");
        }
        
        const buffer = Buffer.from(file.data, "base64");
        res.setHeader("Content-Type", file.type);
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.send(buffer);
    }
    
    // Handle POST upload
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }
    
    try {
        // Run multer middleware
        await runMiddleware(req, res, upload.single("file"));
        
        console.log("File received:", req.file ? req.file.originalname : "NO FILE");
        
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
        
        // Schedule deletion
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
        
        let expiryText = "never";
        if (expiryTime) {
            expiryText = new Date(expiryTime).toISOString();
        }
        
        return res.status(200).json({
            success: true,
            id: id,
            api: proxyUrl,
            link: proxyUrl,
            base64: base64,
            type: req.file.mimetype,
            size: req.file.size,
            filename: req.file.originalname,
            duration: duration,
            expiresAt: expiryText,
            createdAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error("Convert error:", error);
        return res.status(500).json({ error: error.message || "Internal server error" });
    }
}