import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver') as { ZipArchive: new (options?: Record<string, any>) => any };

const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração de diretórios
const DATA_DIR = path.join(__dirname, '../../data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const JSON_FILE = path.join(DATA_DIR, 'signatures.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

if (!fs.existsSync(JSON_FILE) || fs.readFileSync(JSON_FILE, 'utf-8').trim() === '') {
  fs.writeFileSync(JSON_FILE, JSON.stringify([], null, 2));
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

const CLIENT_DIST = path.join(__dirname, '../../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
}

// Configuração do Multer para upload de fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ storage });

interface SignatureEntry {
  id: string;
  name: string;
  imagePath: string;
  timestamp: string;
  type: 'draw' | 'photo';
  deviceId: string;
  password?: string;
}

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'anonimo';
}

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function readSignatures(): SignatureEntry[] {
  try {
    const raw = fs.readFileSync(JSON_FILE, 'utf-8').trim();
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

app.post('/api/signature', upload.single('photo'), async (req, res) => {
  try {
    const { name, drawImage, deviceId, password } = req.body;
    let fileName = '';
    let type: 'draw' | 'photo' = 'draw';

    if (!deviceId) {
      return void res.status(400).json({ error: 'Identificador do dispositivo não enviado.' });
    }

    const normalized = name.trim().toLowerCase();
    const allData = readSignatures();

    const nameExists = allData.some(s => s.name.toLowerCase() === normalized);
    if (nameExists) {
      return void res.status(409).json({ error: 'alguem já salvou com esse nome.' });
    }

    const deviceExists = allData.some(s => s.deviceId === deviceId);
    if (deviceExists) {
      return void res.status(409).json({ error: 'Dispositivo ja realizou uma assinatura. Exclua a anterior para fazer outra.' });
    }

    const baseName = sanitizeFileName(name);
    const ts = formatTimestamp();

    if (req.file) {
      fileName = `${baseName}_${ts}.jpg`;
      const outPath = path.join(UPLOADS_DIR, fileName);
      await sharp(req.file.path)
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toFile(outPath);
      fs.unlinkSync(req.file.path);
      type = 'photo';
    } else if (drawImage) {
      type = 'draw';
      fileName = `${baseName}_${ts}.jpg`;
      const buf = Buffer.from(drawImage.replace(/^data:image\/png;base64,/, ""), 'base64');
      await sharp(buf)
        .resize({ width: 800, withoutEnlargement: true })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 75 })
        .toFile(path.join(UPLOADS_DIR, fileName));
    } else {
      return void res.status(400).json({ error: 'Nenhuma assinatura fornecida.' });
    }

    const newEntry: SignatureEntry = {
      id: uuidv4(),
      name: name.trim(),
      imagePath: fileName,
      timestamp: new Date().toLocaleString('pt-BR'),
      type,
      deviceId,
      ...(password ? { password } : {})
    };

    const currentData = readSignatures();
    currentData.push(newEntry);
    fs.writeFileSync(JSON_FILE, JSON.stringify(currentData, null, 4));

    res.status(201).json({ success: true, entry: newEntry });
  } catch (error) {
    console.error('Erro ao salvar assinatura:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

app.delete('/api/signature/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || !/^\d{4}$/.test(password)) {
      return res.status(400).json({ error: 'Senha deve ter exatamente 4 dígitos.' });
    }

    const data = readSignatures();
    const entry = data.find(s => s.id === id);
    if (!entry) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    if (entry.password && entry.password !== password) {
      return res.status(403).json({ error: 'Senha incorreta.' });
    }

    const filePath = path.join(UPLOADS_DIR, entry.imagePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    const filtered = data.filter(s => s.id !== id);
    fs.writeFileSync(JSON_FILE, JSON.stringify(filtered, null, 4));
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar assinatura:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

app.get('/api/signatures', (req, res) => {
  try {
    const currentData = readSignatures().map(({ password, ...rest }) => rest);
    res.json(currentData);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ler dados.' });
  }
});

app.get('/api/admin/download-all', (req, res) => {
  try {
    const signatures = readSignatures();
    if (signatures.length === 0) {
      return void res.status(404).json({ error: 'Nenhuma assinatura para baixar.' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=assinaturas.zip');

    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('error', (err: unknown) => {
      console.error('Archive error:', err);
    });

    archive.pipe(res);

    for (const sig of signatures) {
      const filePath = path.join(UPLOADS_DIR, sig.imagePath);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(sig.imagePath);
        archive.file(filePath, { name: `${sig.name}${ext}` });
      }
    }

    archive.finalize();
  } catch (error) {
    console.error('Erro ao gerar ZIP:', error);
    if (!res.headersSent) {
      try { res.status(500).json({ error: 'Erro ao gerar ZIP.' }); } catch (_) {}
    }
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
