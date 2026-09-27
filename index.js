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
  limits: { fileSize: 60 * 1024 * 1024 } // 60MB max per song
});

const DEFAULT_PLAYLISTS = [
  "Hindi Song's",
  "English Song's",
  "Haryanvi Song's",
  "FF Song's",
  "Phonk Song's"
];

// Helper: Scan Accounts 1 to 20
function getSupabaseClients() {
  const clients = [];
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    clients.push({
      id: 1,
      name: "Account 1 (Primary)",
      client: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY),
      bucket: process.env.SUPABASE_BUCKET || 'songs'
    });
  }

  for (let i = 1; i <= 20; i++) {
    const url = process.env[`SUPABASE_URL_${i}`];
    const key = process.env[`SUPABASE_KEY_${i}`];
    const bucket = process.env[`SUPABASE_BUCKET_${i}`] || process.env.SUPABASE_BUCKET || 'songs';

    // Avoid duplicate entry if URL_1 is already pushed via default
    if (url && key && (!process.env.SUPABASE_URL || url !== process.env.SUPABASE_URL)) {
      clients.push({
        id: clients.length + 1,
        name: `Account ${clients.length + 1}`,
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

// Helper: Scan folders inside an account bucket
async function scanAccountFolders(acc) {
  try {
    const { data: rootItems, error } = await acc.client.storage
      .from(acc.bucket)
      .list('', { limit: 1000 });

    if (error || !rootItems) return DEFAULT_PLAYLISTS;

    const detectedFolders = rootItems
      .filter(item => item.id === null || !item.name.includes('.'))
      .map(item => item.name);

    // Merge default and custom folders uniquely
    return Array.from(new Set([...DEFAULT_PLAYLISTS, ...detectedFolders]));
  } catch (err) {
    return DEFAULT_PLAYLISTS;
  }
}

// ==========================================
// 1. PUBLIC API: FETCH ALL SONGS ACROSS ALL ACCOUNTS
// ==========================================
app.get('/songs', async (req, res) => {
  try {
    const accounts = getSupabaseClients();
    const songPromises = [];

    for (const acc of accounts) {
      const folders = await scanAccountFolders(acc);

      for (const folder of folders) {
        songPromises.push((async () => {
          try {
            const { data: files } = await acc.client.storage
              .from(acc.bucket)
              .list(folder, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

            if (!files || files.length === 0) return [];

            const audioFiles = files.filter(f =>
              f.name && !f.name.startsWith('.') &&
              f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)
            );

            return audioFiles.map((file, idx) => {
              const filePath = `${folder}/${file.name}`;
              const { data: urlData } = acc.client.storage
                .from(acc.bucket)
                .getPublicUrl(filePath);

              const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim();

              return {
                id: `${folder.toLowerCase().replace(/[^a-z0-9]/g, '')}_${acc.id}_${idx + 1}`,
                fileName: file.name,
                title: cleanTitle,
                url: urlData.publicUrl,
                playlist: folder,
                sizeBytes: file.metadata?.size || 0,
                accountId: acc.id
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
    console.error('Songs fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// ==========================================
// 2. ADMIN/DEV APIS: MULTI-ACCOUNT & STORAGE
// ==========================================
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password && password.trim() === ADMIN_KEY) {
    return res.json({ success: true, message: 'Dev Authentication Successful' });
  }
  return res.status(401).json({ success: false, error: 'Incorrect Dev Key' });
});

// Get Accounts List with Live Storage, Folders & File Counts
app.get('/admin/accounts-overview', verifyAdmin, async (req, res) => {
  try {
    const accounts = getSupabaseClients();
    const overview = [];

    for (const acc of accounts) {
      const folders = await scanAccountFolders(acc);
      let totalSizeBytes = 0;
      let totalSongsCount = 0;
      const folderBreakdown = {};

      for (const folder of folders) {
        try {
          const { data: files } = await acc.client.storage
            .from(acc.bucket)
            .list(folder, { limit: 1000 });

          const audioFiles = (files || []).filter(f =>
            f.name && !f.name.startsWith('.') &&
            f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)
          );

          let folderBytes = 0;
          audioFiles.forEach(f => {
            const bytes = f.metadata?.size || 0;
            folderBytes += bytes;
          });

          totalSizeBytes += folderBytes;
          totalSongsCount += audioFiles.length;
          folderBreakdown[folder] = audioFiles.length;
        } catch (e) {}
      }

      const ONE_GB_BYTES = 1024 * 1024 * 1024;
      const isFull = totalSizeBytes >= ONE_GB_BYTES;
      const usedMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);
      const usedGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(3);
      const percentUsed = Math.min(100, ((totalSizeBytes / ONE_GB_BYTES) * 100)).toFixed(1);

      overview.push({
        id: acc.id,
        name: acc.name,
        bucket: acc.bucket,
        totalSongs: totalSongsCount,
        usedBytes: totalSizeBytes,
        usedMB: usedMB,
        usedGB: usedGB,
        percentUsed: percentUsed,
        isFull: isFull,
        folders: folders,
        folderBreakdown: folderBreakdown
      });
    }

    res.json({ success: true, accounts: overview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create New Playlist / Folder inside an account
app.post('/admin/create-playlist', verifyAdmin, async (req, res) => {
  try {
    const { accountId, playlistName } = req.body;
    if (!playlistName || !playlistName.trim()) {
      return res.status(400).json({ success: false, error: 'Playlist name is required' });
    }

    const cleanFolder = playlistName.trim().replace(/[/\\?%*:|"<>]/g, '');
    const accounts = getSupabaseClients();
    const acc = accounts.find(a => a.id === parseInt(accountId, 10)) || accounts[0];

    // Supabase folders are created by placing a placeholder file
    const placeholderPath = `${cleanFolder}/.init`;
    const emptyBuf = Buffer.from('vision-folder-init');

    const { error } = await acc.client.storage
      .from(acc.bucket)
      .upload(placeholderPath, emptyBuf, { upsert: true });

    if (!error) {
      res.json({ success: true, message: `Playlist "${cleanFolder}" created in ${acc.name}!` });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload song directly into selected account & playlist with 1GB verification
app.post('/admin/upload', verifyAdmin, upload.single('songFile'), async (req, res) => {
  try {
    const { accountId, playlist, customTitle } = req.body;
    const file = req.file;

    if (!file || !playlist) {
      return res.status(400).json({ success: false, error: 'File and Playlist are required' });
    }

    const accounts = getSupabaseClients();
    const targetAcc = accounts.find(a => a.id === parseInt(accountId, 10)) || accounts[0];

    // Check Account 1GB storage limit
    const folders = await scanAccountFolders(targetAcc);
    let totalBytes = 0;
    for (const f of folders) {
      const { data: files } = await targetAcc.client.storage.from(targetAcc.bucket).list(f, { limit: 1000 });
      (files || []).forEach(item => {
        totalBytes += item.metadata?.size || 0;
      });
    }

    const ONE_GB_BYTES = 1024 * 1024 * 1024;
    if (totalBytes + file.size > ONE_GB_BYTES) {
      return res.status(400).json({
        success: false,
        error: `STORAGE FULL! ${targetAcc.name} has reached its 1GB limit. Please select another account from dropdown to upload.`
      });
    }

    const cleanBaseName = (customTitle || file.originalname.replace(/\.[^/.]+$/, ''))
      .trim()
      .replace(/[/\\?%*:|"<>]/g, '');
    const cleanFileName = `${cleanBaseName}.mp3`;
    const targetFilePath = `${playlist}/${cleanFileName}`;

    const { data, error } = await targetAcc.client.storage
      .from(targetAcc.bucket)
      .upload(targetFilePath, file.buffer, {
        contentType: file.mimetype || 'audio/mpeg',
        upsert: true
      });

    if (!error && data) {
      res.json({ success: true, message: `"${cleanBaseName}" uploaded to ${targetAcc.name} [${playlist}] successfully!` });
    } else {
      res.status(500).json({ success: false, error: error ? error.message : 'Upload failed' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete song
app.post('/admin/delete', verifyAdmin, async (req, res) => {
  try {
    const { accountId, playlist, fileName } = req.body;
    if (!playlist || !fileName) {
      return res.status(400).json({ success: false, error: 'Playlist & fileName required' });
    }

    const targetFilePath = `${playlist}/${fileName}`;
    const accounts = getSupabaseClients();
    const targetAcc = accounts.find(a => a.id === parseInt(accountId, 10)) || accounts[0];

    const { data, error } = await targetAcc.client.storage
      .from(targetAcc.bucket)
      .remove([targetFilePath]);

    if (!error && data && data.length > 0) {
      res.json({ success: true, message: `"${fileName}" deleted successfully.` });
    } else {
      // Fallback check all accounts if accountId wasn't matched
      let found = false;
      for (const a of accounts) {
        const delRes = await a.client.storage.from(a.bucket).remove([targetFilePath]);
        if (!delRes.error && delRes.data && delRes.data.length > 0) {
          found = true;
          break;
        }
      }
      if (found) res.json({ success: true, message: `"${fileName}" deleted successfully.` });
      else res.status(500).json({ success: false, error: error ? error.message : 'Could not remove file' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rename song
app.post('/admin/rename', verifyAdmin, async (req, res) => {
  try {
    const { accountId, playlist, oldFileName, newTitle } = req.body;
    if (!playlist || !oldFileName || !newTitle) {
      return res.status(400).json({ success: false, error: 'Missing parameters' });
    }

    const cleanNewFileName = `${newTitle.trim().replace(/[/\\?%*:|"<>]/g, '')}.mp3`;
    const oldPath = `${playlist}/${oldFileName}`;
    const newPath = `${playlist}/${cleanNewFileName}`;

    const accounts = getSupabaseClients();
    const targetAcc = accounts.find(a => a.id === parseInt(accountId, 10)) || accounts[0];

    const { error } = await targetAcc.client.storage
      .from(targetAcc.bucket)
      .move(oldPath, newPath);

    if (!error) {
      res.json({ success: true, message: `Renamed to "${newTitle}" successfully.` });
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
