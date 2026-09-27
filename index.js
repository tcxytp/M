import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'Vision@Admin7827#Secure';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 } // 60MB max
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
  const key = authHeader ? authHeader.replace('Bearer ', '').trim() : '';
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Dev Key' });
  }
  next();
}

app.get('/', (req, res) => {
  res.send('Vision Music Engine is Online.');
});

// PUBLIC API: STRICT ISOLATED FOLDER SCANNING
app.get('/songs', async (req, res) => {
  try {
    const accounts = getSupabaseClients();
    const songPromises = [];

    for (const acc of accounts) {
      for (const folder of TARGET_FOLDERS) {
        songPromises.push((async () => {
          try {
            // Check exact folder name and alternate folder name without apostrophe
            const possibleFolderNames = [
              folder,
              folder.replace("'", ""),
              folder.replace("’", "")
            ];

            let files = [];
            let currentPath = folder;

            for (const fName of possibleFolderNames) {
              const resList = await acc.client.storage
                .from(acc.bucket)
                .list(fName, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

              if (resList.data && resList.data.length > 0) {
                files = resList.data;
                currentPath = fName;
                break;
              }
            }

            // ONLY fall back to root for Hindi Song's if folder is empty
            if ((!files || files.length === 0) && folder === "Hindi Song's") {
              const rootRes = await acc.client.storage
                .from(acc.bucket)
                .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

              if (rootRes.data && rootRes.data.length > 0) {
                files = rootRes.data.filter(item => item.name && item.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i));
                currentPath = '';
              }
            }

            if (!files || files.length === 0) return [];

            const audioFiles = files.filter(f =>
              f.name && !f.name.startsWith('.') &&
              f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)
            );

            return audioFiles.map((file, idx) => {
              const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
              const { data: urlData } = acc.client.storage
                .from(acc.bucket)
                .getPublicUrl(filePath);

              const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim();

              return {
                id: `${folder.toLowerCase().replace(/[^a-z0-9]/g, '')}_${idx + 1}`,
                fileName: file.name,
                title: cleanTitle,
                url: urlData.publicUrl,
                playlist: folder
              };
            });
          } catch (e) {
            return [];
          }
        })());
      }
    }

    const results = await Promise.all(songPromises);
    res.json(results.flat());
  } catch (error) {
    console.error('Fatal fetch error:', error);
    res.status(500).json({ error: 'Server could not fetch songs' });
  }
});

// DEVS APIS
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password && password.trim() === ADMIN_KEY) {
    return res.json({ success: true, message: 'Dev Authentication Successful' });
  }
  return res.status(401).json({ success: false, error: 'Incorrect Dev Key' });
});

// Upload song directly into selected playlist folder
app.post('/admin/upload', verifyAdmin, upload.single('songFile'), async (req, res) => {
  try {
    const { playlist, customTitle } = req.body;
    const file = req.file;

    if (!file || !playlist) {
      return res.status(400).json({ success: false, error: 'Missing audio file or playlist' });
    }

    const cleanBaseName = (customTitle || file.originalname.replace(/\.[^/.]+$/, ''))
      .trim()
      .replace(/[/\\?%*:|"<>]/g, '');
    const cleanFileName = `${cleanBaseName}.mp3`;
    const targetFilePath = `${playlist}/${cleanFileName}`;

    const accounts = getSupabaseClients();
    let uploaded = false;
    let uploadErrMsg = '';

    for (const acc of accounts) {
      const { data, error } = await acc.client.storage
        .from(acc.bucket)
        .upload(targetFilePath, file.buffer, {
          contentType: file.mimetype || 'audio/mpeg',
          upsert: true
        });

      if (!error && data) {
        uploaded = true;
        break;
      } else if (error) {
        uploadErrMsg = error.message;
      }
    }

    if (uploaded) {
      res.json({ success: true, message: `"${cleanBaseName}" uploaded to ${playlist} successfully!` });
    } else {
      res.status(500).json({ success: false, error: uploadErrMsg || 'Could not write to Supabase bucket' });
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
      return res.status(400).json({ success: false, error: 'Playlist & fileName required' });
    }

    const targetFilePath = `${playlist}/${fileName}`;
    const accounts = getSupabaseClients();
    let deleted = false;

    for (const acc of accounts) {
      let { data, error } = await acc.client.storage
        .from(acc.bucket)
        .remove([targetFilePath]);

      if (!error && data && data.length > 0) {
        deleted = true;
        break;
      }

      // Check root if uploaded in root previously
      const rootRes = await acc.client.storage
        .from(acc.bucket)
        .remove([fileName]);

      if (!rootRes.error && rootRes.data && rootRes.data.length > 0) {
        deleted = true;
        break;
      }
    }

    res.json({ success: true, message: `"${fileName}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rename song
app.post('/admin/rename', verifyAdmin, async (req, res) => {
  try {
    const { playlist, oldFileName, newTitle } = req.body;
    if (!playlist || !oldFileName || !newTitle) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    const cleanNewFileName = `${newTitle.trim().replace(/[/\\?%*:|"<>]/g, '')}.mp3`;
    const oldPath = `${playlist}/${oldFileName}`;
    const newPath = `${playlist}/${cleanNewFileName}`;
    const accounts = getSupabaseClients();

    let moved = false;
    for (const acc of accounts) {
      const { error } = await acc.client.storage
        .from(acc.bucket)
        .move(oldPath, newPath);

      if (!error) {
        moved = true;
        break;
      }

      const rootMove = await acc.client.storage
        .from(acc.bucket)
        .move(oldFileName, newPath);

      if (!rootMove.error) {
        moved = true;
        break;
      }
    }

    if (moved) {
      res.json({ success: true, message: `Renamed to "${newTitle}" successfully.` });
    } else {
      res.status(500).json({ success: false, error: 'Failed to rename on storage' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
