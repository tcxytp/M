import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'Vision@Admin2026#Secure';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per song
});

const TARGET_FOLDERS = [
  "Hindi Song's",
  "English Song's",
  "Haryanvi Song's",
  "FF Song's",
  "Phonk Song's"
];

function getSupabaseClients() {
  const clients = [];
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    clients.push({
      client: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY),
      bucket: process.env.SUPABASE_BUCKET || 'songs'
    });
  }
  for (let i = 1; i <= 20; i++) {
    const url = process.env[`SUPABASE_URL_${i}`];
    const key = process.env[`SUPABASE_KEY_${i}`];
    const bucket = process.env[`SUPABASE_BUCKET_${i}`] || process.env.SUPABASE_BUCKET || 'songs';
    if (url && key) {
      clients.push({
        client: createClient(url, key),
        bucket: bucket
      });
    }
  }
  return clients;
}

function verifyAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-key'];
  if (!authHeader || authHeader.replace('Bearer ', '').trim() !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin Secret' });
  }
  next();
}

app.get('/', (req, res) => {
  res.send('Vision Music Engine is Online.');
});

// Fetch all songs
app.get('/songs', async (req, res) => {
  try {
    const accounts = getSupabaseClients();
    const promises = [];

    for (const acc of accounts) {
      for (const folderName of TARGET_FOLDERS) {
        promises.push((async () => {
          const { data: files } = await acc.client.storage
            .from(acc.bucket)
            .list(folderName, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

          if (!files || files.length === 0) return [];

          const audio = files.filter(f => f.name && !f.name.startsWith('.') && f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i));

          return audio.map((file, idx) => {
            const { data } = acc.client.storage.from(acc.bucket).getPublicUrl(`${folderName}/${file.name}`);
            return {
              id: `${folderName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${idx + 1}`,
              fileName: file.name,
              title: file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim(),
              url: data.publicUrl,
              playlist: folderName
            };
          });
        })());
      }
    }

    const results = await Promise.all(promises);
    res.json(results.flat());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Admin Auth
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_KEY) {
    return res.json({ success: true, message: 'Authenticated successfully' });
  }
  return res.status(401).json({ success: false, error: 'Invalid password' });
});

// Upload song directly into matching folder
app.post('/admin/upload', verifyAdmin, upload.single('songFile'), async (req, res) => {
  try {
    const { playlist, customTitle } = req.body;
    const file = req.file;

    if (!file || !playlist) {
      return res.status(400).json({ success: false, error: 'File and Playlist are required' });
    }

    const cleanTitle = (customTitle || file.originalname.replace(/\.[^/.]+$/, ''))
      .trim()
      .replace(/[^a-zA-Z0-9 _-]/g, '') + '.mp3';

    const targetPath = `${playlist}/${cleanTitle}`;
    const accounts = getSupabaseClients();
    let uploaded = false;

    for (const acc of accounts) {
      const { data, error } = await acc.client.storage
        .from(acc.bucket)
        .upload(targetPath, file.buffer, {
          contentType: file.mimetype || 'audio/mpeg',
          upsert: true
        });

      if (!error && data) {
        uploaded = true;
        break;
      }
    }

    if (uploaded) {
      res.json({ success: true, message: `Uploaded to ${playlist} successfully!` });
    } else {
      res.status(500).json({ success: false, error: 'Failed to write file to Supabase' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete song
app.post('/admin/delete', verifyAdmin, async (req, res) => {
  try {
    const { playlist, fileName } = req.body;
    if (!playlist || !fileName) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    const targetPath = `${playlist}/${fileName}`;
    const accounts = getSupabaseClients();
    let deleted = false;

    for (const acc of accounts) {
      const { data, error } = await acc.client.storage
        .from(acc.bucket)
        .remove([targetPath]);

      if (!error && data && data.length > 0) {
        deleted = true;
        break;
      }
    }

    res.json({ success: true, message: `Deleted ${fileName} successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rename song
app.post('/admin/rename', verifyAdmin, async (req, res) => {
  try {
    const { playlist, oldFileName, newFileName } = req.body;
    if (!playlist || !oldFileName || !newFileName) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    const cleanNewName = newFileName.trim().replace(/[^a-zA-Z0-9 _-]/g, '') + '.mp3';
    const oldPath = `${playlist}/${oldFileName}`;
    const newPath = `${playlist}/${cleanNewName}`;
    const accounts = getSupabaseClients();

    let renamed = false;
    for (const acc of accounts) {
      const { error: moveError } = await acc.client.storage
        .from(acc.bucket)
        .move(oldPath, newPath);

      if (!moveError) {
        renamed = true;
        break;
      }
    }

    if (renamed) {
      res.json({ success: true, message: 'Song renamed successfully' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to rename file' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
