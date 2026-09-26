import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Valid targeted playlists/folders
const TARGET_FOLDERS = [
  "Hindi Song's",
  "English Song's",
  "Haryanvi Song's",
  "FF Song's",
  "Phonk Song's"
];

// Dynamically collect all SUPABASE_URL_X and SUPABASE_KEY_X from Railway environment
function getSupabaseClients() {
  const clients = [];

  // Default fallback (SUPABASE_URL, SUPABASE_KEY)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    clients.push({
      client: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY),
      bucket: process.env.SUPABASE_BUCKET || 'songs'
    });
  }

  // Iterate through accounts 1 to 20 automatically
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

// Fetch files from a specific named folder inside an account bucket
async function fetchSongsFromFolder(supabase, bucket, folderName) {
  try {
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(folderName, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error || !files || files.length === 0) {
      return [];
    }

    // Audio files filter
    const audioFiles = files.filter(f =>
      f.name &&
      !f.name.startsWith('.') &&
      f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)
    );

    return audioFiles.map((file, idx) => {
      const filePath = `${folderName}/${file.name}`;
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/_/g, ' ')
        .trim();

      return {
        id: `${folderName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}_${idx}`,
        title: cleanTitle,
        url: urlData.publicUrl,
        playlist: folderName // Exact Folder Name is assigned as the Playlist
      };
    });
  } catch (err) {
    console.error(`Error reading ${folderName}:`, err.message);
    return [];
  }
}

// Scan every configured account for targeted folder names
async function scanAllAccounts() {
  const accounts = getSupabaseClients();
  const allSongPromises = [];

  for (const acc of accounts) {
    for (const folderName of TARGET_FOLDERS) {
      allSongPromises.push(fetchSongsFromFolder(acc.client, acc.bucket, folderName));
    }
  }

  const results = await Promise.all(allSongPromises);
  return results.flat();
}

app.get('/', (req, res) => {
  res.send('Vision Music Dynamic Folder-to-Playlist Backend is running!');
});

app.get('/songs', async (req, res) => {
  try {
    const songs = await scanAllAccounts();
    console.log(`[TOTAL SERVED] ${songs.length} songs processed.`);
    res.json(songs);
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Failed to scan storage accounts' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
