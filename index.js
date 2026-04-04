import express from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max

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
    if (expiryTime === null) return; // forever, no deletion
    
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

// Root endpoint
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// API convert with duration option
app.post("/api/convert", upload.single("file"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        if (!isValidFile(req.file.mimetype)) {
            return res.status(400).json({ error: "Invalid file type. Only images and videos allowed" });
        }

        // Get duration from form data or query
        const duration = req.body.duration || req.query.duration || "24h";
        
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
        
        // Schedule deletion if not forever
        if (expiryTime !== null) {
            scheduleDeletion(id, expiryTime);
        }

        const proxyUrl = `/x/BitWrap/${id}.${ext}`;
        
        let expiryText = "never";
        if (expiryTime) {
            const expiryDate = new Date(expiryTime);
            expiryText = expiryDate.toISOString();
        }

        res.setHeader("Content-Type", "application/json");
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
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Proxy endpoint
app.get("/x/BitWrap/:id", (req, res) => {
    const id = req.params.id.split(".")[0];
    const file = store.get(id);

    if (!file) {
        return res.status(404).send("File not found or expired");
    }

    const buffer = Buffer.from(file.data, "base64");
    res.setHeader("Content-Type", file.type);
    
    // Cache control based on duration
    if (file.duration === "forever") {
        res.setHeader("Cache-Control", "public, max-age=31536000");
    } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
    }
    
    return res.send(buffer);
});

// Get file info endpoint
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

// Delete file endpoint
app.delete("/api/delete/:id", (req, res) => {
    const id = req.params.id;
    
    if (!store.has(id)) {
        return res.status(404).json({ error: "File not found" });
    }
    
    store.delete(id);
    return res.json({ success: true, message: "File deleted" });
});

// List all active files (for debugging)
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
        memoryUsage: process.memoryUsage().rss
    });
});

// 404 handler
app.use((req, res) => {
    if (req.path === "/api/convert" || req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "API endpoint not found" });
    }
    res.status(404).send("Not Found");
});

export default app;