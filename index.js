import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SUPER_ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'Vision@Admin7827#Secure';
const MINI_ADMIN_KEY = process.env.MINI_ADMIN_KEY || 'Vision@MiniAdmin2026#Access';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB per file
});

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

function verifyAnyAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-key'];
  const key = authHeader ? authHeader.replace('Bearer ', '').trim() : '';

  if (key === SUPER_ADMIN_KEY) {
    req.adminRole = 'superadmin';
    return next();
  } else if (key === MINI_ADMIN_KEY) {
    req.adminRole = 'miniadmin';
    return next();
  }

  return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Key' });
}

function verifySuperAdminOnly(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-admin-key'];
  const key = authHeader ? authHeader.replace('Bearer ', '').trim() : '';

  if (key === SUPER_ADMIN_KEY) {
    req.adminRole = 'superadmin';
    return next();
  }

  return res.status(403).json({ success: false, error: 'Access Denied: Super Admin Only Feature' });
}

app.get('/', (req, res) => {
  res.send('Vision Music Multi-Role Server Online.');
});

async function scanAccountRealFolders(acc) {
  try {
    const { data: rootItems, error } = await acc.client.storage
      .from(acc.bucket)
      .list('', { limit: 1000 });

    if (error || !rootItems) return [];

    const detectedFolders = rootItems
      .filter(item => item.id === null || !item.name.includes('.'))
      .map(item => item.name);

    return Array.from(new Set(detectedFolders));
  } catch (err) {
    return [];
  }
}

// 1. PUBLIC API: FETCH ALL TRACKS
app.get('/songs', async (req, res) => {
  try {
    const accounts = getSupabaseClients();
    const songPromises = [];

    for (const acc of accounts) {
      const folders = await scanAccountRealFolders(acc);

      if (folders.length === 0) {
        songPromises.push((async () => {
          try {
            const { data: rootFiles } = await acc.client.storage
              .from(acc.bucket)
              .list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

            if (!rootFiles) return [];

            const audio = rootFiles.filter(f => f.name && f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i));
            return audio.map((file, idx) => {
              const { data: urlData } = acc.client.storage.from(acc.bucket).getPublicUrl(file.name);
              return {
                id: `root_${acc.id}_${idx + 1}`,
                fileName: file.name,
                title: file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim(),
                url: urlData.publicUrl,
                playlist: "Hindi Song's",
                sizeBytes: file.metadata?.size || 0,
                accountId: acc.id
              };
            });
          } catch (e) {
            return [];
          }
        })());
      } else {
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
    }

    const results = await Promise.all(songPromises);
    res.json(results.flat());
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// 2. DUAL ROLE AUTHENTICATION
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  const key = (password || '').trim();

  if (key === SUPER_ADMIN_KEY) {
    return res.json({
      success: true,
      role: 'superadmin',
      message: 'Authenticated as Super Admin'
    });
  } else if (key === MINI_ADMIN_KEY) {
    return res.json({
      success: true,
      role: 'miniadmin',
      message: 'Authenticated as Mini Admin'
    });
  }

  return res.status(401).json({ success: false, error: 'Incorrect Access Key' });
});

// Accounts Overview with All Account Folders
app.get('/admin/accounts-overview', verifyAnyAdmin, async (req, res) => {
  try {
    const accounts = getSupabaseClients();
    const overview = [];

    for (const acc of accounts) {
      const realFolders = await scanAccountRealFolders(acc);
      let totalSizeBytes = 0;
      let totalSongsCount = 0;
      const folderBreakdown = {};

      for (const folder of realFolders) {
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
            folderBytes += f.metadata?.size || 0;
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
        folders: realFolders,
        folderBreakdown: folderBreakdown
      });
    }

    res.json({ success: true, role: req.adminRole, accounts: overview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create Playlist (Super Admin Only)
app.post('/admin/create-playlist', verifySuperAdminOnly, async (req, res) => {
  try {
    const { accountId, playlistName } = req.body;
    if (!playlistName || !playlistName.trim()) {
      return res.status(400).json({ success: false, error: 'Playlist name is required' });
    }

    const cleanFolder = playlistName.trim().replace(/[/\\?%*:|"<>]/g, '');
    const accounts = getSupabaseClients();
    const acc = accounts.find(a => a.id === parseInt(accountId, 10)) || accounts[0];

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

// Upload songs (Batch handler with auto-account discovery for Mini Admin)
app.post('/admin/upload', verifyAnyAdmin, upload.array('songFiles', 50), async (req, res) => {
  try {
    const { accountId, playlist } = req.body;
    const files = req.files;

    if (!files || files.length === 0 || !playlist) {
      return res.status(400).json({ success: false, error: 'Files and Playlist are required' });
    }

    const accounts = getSupabaseClients();
    let targetAcc = null;

    if (accountId) {
      targetAcc = accounts.find(a => a.id === parseInt(accountId, 10));
    }

    // Auto-detect account if accountId not provided by Mini Admin
    if (!targetAcc) {
      for (const a of accounts) {
        const folders = await scanAccountRealFolders(a);
        if (folders.includes(playlist)) {
          targetAcc = a;
          break;
        }
      }
    }

    if (!targetAcc) {
      targetAcc = accounts[0];
    }

    // Check storage limits
    const folders = await scanAccountRealFolders(targetAcc);
    let totalBytes = 0;
    for (const f of folders) {
      const { data: fList } = await targetAcc.client.storage.from(targetAcc.bucket).list(f, { limit: 1000 });
      (fList || []).forEach(item => {
        totalBytes += item.metadata?.size || 0;
      });
    }

    let incomingBatchBytes = 0;
    files.forEach(f => incomingBatchBytes += f.size);

    const ONE_GB_BYTES = 1024 * 1024 * 1024;
    if (totalBytes + incomingBatchBytes > ONE_GB_BYTES) {
      return res.status(400).json({
        success: false,
        error: `STORAGE LIMIT REACHED! ${targetAcc.name} is full (1GB limit).`
      });
    }

    let uploadedCount = 0;
    const uploadErrors = [];

    for (const file of files) {
      const cleanBaseName = file.originalname.replace(/\.[^/.]+$/, '').trim().replace(/[/\\?%*:|"<>]/g, '');
      const cleanFileName = `${cleanBaseName}.mp3`;
      const targetFilePath = `${playlist}/${cleanFileName}`;

      const { error } = await targetAcc.client.storage
        .from(targetAcc.bucket)
        .upload(targetFilePath, file.buffer, {
          contentType: file.mimetype || 'audio/mpeg',
          upsert: true
        });

      if (!error) {
        uploadedCount++;
      } else {
        uploadErrors.push(file.originalname);
      }
    }

    res.json({
      success: true,
      message: `Successfully uploaded ${uploadedCount} of ${files.length} songs to [${playlist}]!`,
      failed: uploadErrors
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete song (With auto-account fallback)
app.post('/admin/delete', verifyAnyAdmin, async (req, res) => {
  try {
    const { accountId, playlist, fileName } = req.body;
    if (!playlist || !fileName) {
      return res.status(400).json({ success: false, error: 'Playlist & fileName required' });
    }

    const targetFilePath = `${playlist}/${fileName}`;
    const accounts = getSupabaseClients();
    let targetAcc = accountId ? accounts.find(a => a.id === parseInt(accountId, 10)) : null;

    if (targetAcc) {
      const { data, error } = await targetAcc.client.storage
        .from(targetAcc.bucket)
        .remove([targetFilePath]);

      if (!error && data && data.length > 0) {
        return res.json({ success: true, message: `"${fileName}" deleted successfully.` });
      }
    }

    // Fallback search across accounts
    let deleted = false;
    for (const a of accounts) {
      const { data, error } = await a.client.storage.from(a.bucket).remove([targetFilePath]);
      if (!error && data && data.length > 0) {
        deleted = true;
        break;
      }
    }

    if (deleted) {
      res.json({ success: true, message: `"${fileName}" deleted successfully.` });
    } else {
      res.status(500).json({ success: false, error: 'Could not remove file' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rename song (Super Admin Only)
app.post('/admin/rename', verifySuperAdminOnly, async (req, res) => {
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
