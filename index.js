const app = express(); const upload = multer();

const store = new Map();

function randomId(len) { return crypto.randomBytes(len).toString("hex").slice(0, len); }

app.post("/api/convert", upload.single("file"), (req, res) => { if (!req.file) return res.status(400).json({ error: "No file" });

const isImage = req.file.mimetype.startsWith("image"); const ext = isImage ? "png" : "mp4"; const id = randomId(isImage ? 8 : 6);

const base64 = req.file.buffer.toString("base64");

store.set(id, { data: base64, type: req.file.mimetype });

const proxyUrl = /x/BitWrap/${id}.${ext};

res.json({ api: proxyUrl, base64: base64, link: proxyUrl }); });

app.get("/x/:id", (req, res) => { const id = req.params.id.split(".")[0]; const file = store.get(id);

if (!file) return res.status(404).send("Not found");

const buffer = Buffer.from(file.data, "base64"); res.set("Content-Type", file.type); res.send(buffer); });

app.use(express.static("."));

app.listen(3000, () => console.log("Running on 3000"));

