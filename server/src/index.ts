import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import https from 'https';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver') as { ZipArchive: new (options?: Record<string, any>) => any };

const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
const BUCKET = 'signatures';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const CLIENT_DIST = path.join(__dirname, '../../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
}

// Evitar que o Render durma (ping automático a cada 10 min)
const RENDER_URL = process.env.RENDER_URL;
if (RENDER_URL) {
  app.get('/ping', (req, res) => res.send('Acordado!'));
  setInterval(() => {
    https.get(RENDER_URL, (res) => {
      console.log(`Ping automático: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error('Erro no ping:', err.message);
    });
  }, 600000);
}

// Multer — diretório temporário
const upload = multer({ dest: '/tmp/uploads' });

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

// POST /api/signature
app.post('/api/signature', upload.single('photo'), async (req, res) => {
  try {
    const { name, drawImage, deviceId, password } = req.body;

    if (!deviceId) {
      return void res.status(400).json({ error: 'Identificador do dispositivo não enviado.' });
    }

    const normalized = name.trim().toLowerCase();

    const { data: existingName } = await supabase
      .from('signatures')
      .select('id')
      .ilike('name', normalized)
      .maybeSingle();
    if (existingName) {
      return void res.status(409).json({ error: 'alguem já salvou com esse nome.' });
    }

    const { data: existingDevice } = await supabase
      .from('signatures')
      .select('id')
      .eq('device_id', deviceId)
      .maybeSingle();
    if (existingDevice) {
      return void res.status(409).json({ error: 'Dispositivo ja realizou uma assinatura. Exclua a anterior para fazer outra.' });
    }

    const baseName = sanitizeFileName(name);
    const ts = formatTimestamp();
    const fileName = `${baseName}_${ts}.jpg`;
    let type: 'draw' | 'photo' = 'draw';
    let imageBuffer: Buffer;

    if (req.file) {
      type = 'photo';
      imageBuffer = await sharp(req.file.path)
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
      fs.unlinkSync(req.file.path);
    } else if (drawImage) {
      const buf = Buffer.from(drawImage.replace(/^data:image\/png;base64,/, ''), 'base64');
      imageBuffer = await sharp(buf)
        .resize({ width: 800, withoutEnlargement: true })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 75 })
        .toBuffer();
    } else {
      return void res.status(400).json({ error: 'Nenhuma assinatura fornecida.' });
    }

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: true });
    if (uploadErr) {
      console.error('Erro upload Storage:', uploadErr);
      return void res.status(500).json({ error: 'Erro ao salvar imagem.' });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    const imageUrl = urlData.publicUrl;

    const { data: inserted, error: dbErr } = await supabase
      .from('signatures')
      .insert({
        name: name.trim(),
        image_path: fileName,
        image_url: imageUrl,
        timestamp: new Date().toLocaleString('pt-BR'),
        type,
        device_id: deviceId,
        ...(password ? { password } : {})
      })
      .select()
      .single();

    if (dbErr) {
      console.error('Erro DB:', dbErr);
      await supabase.storage.from(BUCKET).remove([fileName]);
      return void res.status(500).json({ error: 'Erro ao salvar dados.' });
    }

    res.status(201).json({ success: true, entry: inserted });
  } catch (error) {
    console.error('Erro ao salvar assinatura:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// GET /api/signatures
app.get('/api/signatures', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('signatures')
      .select('id, name, image_path, image_url, timestamp, type, device_id')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erro ao listar:', error);
    res.status(500).json({ error: 'Erro ao ler dados.' });
  }
});

// DELETE /api/signature/:id
app.delete('/api/signature/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || !/^\d{4}$/.test(password)) {
      return res.status(400).json({ error: 'Senha deve ter exatamente 4 dígitos.' });
    }

    const { data: entry, error: findErr } = await supabase
      .from('signatures')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findErr || !entry) {
      return res.status(404).json({ error: 'Assinatura não encontrada.' });
    }

    if (entry.password && entry.password !== password) {
      return res.status(403).json({ error: 'Senha incorreta.' });
    }

    await supabase.storage.from(BUCKET).remove([entry.image_path]);
    await supabase.from('signatures').delete().eq('id', id);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// GET /api/admin/download-all
app.get('/api/admin/download-all', async (req, res) => {
  try {
    const { data: signatures, error } = await supabase
      .from('signatures')
      .select('id, name, image_path, image_url');

    if (error || !signatures || signatures.length === 0) {
      return void res.status(404).json({ error: 'Nenhuma assinatura para baixar.' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=assinaturas.zip');

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err: unknown) => console.error('Archive error:', err));
    archive.pipe(res);

    for (const sig of signatures) {
      const { data: blob } = await supabase.storage.from(BUCKET).download(sig.image_path);
      if (blob) {
        const ext = path.extname(sig.image_path);
        archive.append(Buffer.from(await blob.arrayBuffer()), { name: `${sig.name}${ext}` });
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM recebido, encerrando...');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
