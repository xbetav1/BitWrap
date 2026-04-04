import express from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Konfigurasi multer untuk Vercel (memory storage)
const upload = multer({ 
    limits: { fileSize: 500 * 1024 * 1024 },
    storage: multer.memoryStorage()
});

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

function scheduleDeletion(id, expiryTime) {
    if (expiryTime === null) return;
    
    const delay = expiryTime - Date.now();
    if (delay <= 0) {
        if (store.has(id)) store.delete(id);
        return;
    }
    
    setTimeout(() => {
        if (store.has(id)) {
            store.delete(id);
            console.log(`File ${id} deleted after expiry`);
        }
    }, delay);
}

// Parse form data untuk duration
app.use(express.urlencoded({ extended: true }));

// Root endpoint - serve HTML
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// API convert - PASTIKAN path ini match dengan yang dipanggil frontend
app.post("/api/convert", upload.single("file"), (req, res) => {
    console.log("=== /api/convert called ===");
    console.log("File received:", req.file ? req.file.originalname : "NO FILE");
    console.log("Body:", req.body);
    
    try {
        if (!req.file) {
            console.log("Error: No file");
            return res.status(400).json({ error: "No file uploaded" });
        }

        if (!isValidFile(req.file.mimetype)) {
            console.log("Error: Invalid type", req.file.mimetype);
            return res.status(400).json({ error: "Invalid file type. Only images and videos allowed" });
        }

        const duration = req.body.duration || "24h";
        console.log("Duration:", duration);
        
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
        
        if (expiryTime !== null) {
            scheduleDeletion(id, expiryTime);
        }

        const proxyUrl = `/x/BitWrap/${id}.${ext}`;
        
        let expiryText = "never";
        if (expiryTime) {
            expiryText = new Date(expiryTime).toISOString();
        }

        console.log("Success! ID:", id);
        
        return res.json({
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
});

// Proxy endpoint
app.get("/x/BitWrap/:id", (req, res) => {
    console.log("=== Proxy called ===");
    const id = req.params.id.split(".")[0];
    const file = store.get(id);

    if (!file) {
        console.log("File not found:", id);
        return res.status(404).send("File not found or expired");
    }

    const buffer = Buffer.from(file.data, "base64");
    res.setHeader("Content-Type", file.type);
    
    if (file.duration === "forever") {
        res.setHeader("Cache-Control", "public, max-age=31536000");
    } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
    }
    
    console.log("Serving file:", id);
    return res.send(buffer);
});

// Get file info
app.get("/api/info/:id", (req, res) => {
    const id = req.params.id;
    const file = store.get(id);
    
    if (!file) {
        return res.status(404).json({ error: "File not found" });
    }
    
    return res.json({
        id: id,
        type: file.type,
        size: file.size,
        filename: file.filename,
        duration: file.duration,
        expiresAt: file.expiryTime,
        createdAt: file.createdAt
    });
});

// Delete file
app.delete("/api/delete/:id", (req, res) => {
    const id = req.params.id;
    
    if (!store.has(id)) {
        return res.status(404).json({ error: "File not found" });
    }
    
    store.delete(id);
    return res.json({ success: true, message: "File deleted" });
});

// List files
app.get("/api/list", (req, res) => {
    const files = [];
    for (const [id, file] of store.entries()) {
        files.push({
            id: id,
            type: file.type,
            size: file.size,
            filename: file.filename,
            duration: file.duration,
            expiresAt: file.expiryTime,
            createdAt: file.createdAt
        });
    }
    return res.json({ count: files.length, files: files });
});

// Health check
app.get("/api/health", (req, res) => {
    return res.json({
        status: "ok",
        storeSize: store.size,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Handle 404 untuk API
app.use((req, res) => {
    console.log("404:", req.method, req.path);
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: `API endpoint not found: ${req.path}` });
    }
    res.status(404).send("Not Found");
});

// Export untuk Vercel
export default app;