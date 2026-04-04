import express from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

const store = new Map();

function randomId(len) {
    return crypto.randomBytes(len).toString("hex").slice(0, len);
}

function isValidFile(mimetype) {
    return mimetype.startsWith("image/") || mimetype.startsWith("video/");
}

// Root endpoint - harus kirim HTML dulu, BUKAN JSON
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// API convert
app.post("/api/convert", upload.single("file"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        if (!isValidFile(req.file.mimetype)) {
            return res.status(400).json({ error: "Invalid file type. Only images and videos allowed" });
        }

        const isImage = req.file.mimetype.startsWith("image");
        const ext = isImage ? "png" : "mp4";
        const id = randomId(isImage ? 8 : 6);
        const base64 = req.file.buffer.toString("base64");

        store.set(id, {
            data: base64,
            type: req.file.mimetype,
            createdAt: Date.now()
        });

        setTimeout(() => {
            if (store.has(id)) store.delete(id);
        }, 3600000);

        const proxyUrl = `/x/BitWrap/${id}.${ext}`;

        // PASTIKAN response JSON valid
        res.setHeader("Content-Type", "application/json");
        return res.json({
            success: true,
            api: proxyUrl,
            base64: base64,
            link: proxyUrl,
            id: id,
            type: req.file.mimetype,
            size: req.file.size
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
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(buffer);
});

// Health check
app.get("/api/health", (req, res) => {
    return res.json({
        status: "ok",
        storeSize: store.size,
        uptime: process.uptime()
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