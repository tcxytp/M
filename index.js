import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 5 Playlists Configuration with Dedicated Accounts & Folder Mappings
const ACCOUNTS_CONFIG = [
  {
    playlist: "Hindi Song's",
    url: process.env.SUPABASE_URL_1 || process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY_1 || process.env.SUPABASE_KEY,
    bucket: process.env.SUPABASE_BUCKET_1 || process.env.SUPABASE_BUCKET || 'songs',
    folder: "Hindi Song's"
  },
  {
    playlist: "English Song's",
    url: process.env.SUPABASE_URL_2,
    key: process.env.SUPABASE_KEY_2,
    bucket: process.env.SUPABASE_BUCKET_2 || process.env.SUPABASE_BUCKET || 'songs',
    folder: "English Song's"
  },
  {
    playlist: "FF Song's",
    url: process.env.SUPABASE_URL_3,
    key: process.env.SUPABASE_KEY_3,
    bucket: process.env.SUPABASE_BUCKET_3 || process.env.SUPABASE_BUCKET || 'songs',
    folder: "FF Song's"
  },
  {
    playlist: "Phonk Song's",
    url: process.env.SUPABASE_URL_4,
    key: process.env.SUPABASE_KEY_4,
    bucket: process.env.SUPABASE_BUCKET_4 || process.env.SUPABASE_BUCKET || 'songs',
    folder: "Phonk Song's"
  },
  {
    playlist: "Haryanvi Song's",
    url: process.env.SUPABASE_URL_5,
    key: process.env.SUPABASE_KEY_5,
    bucket: process.env.SUPABASE_BUCKET_5 || process.env.SUPABASE_BUCKET || 'songs',
    folder: "Haryanvi Song's"
  }
];

// Helper: Folder ya Root dono jagah se fetch karne wala smart function
async function fetchPlaylistSongs(config) {
  if (!config.url || !config.key) {
    return [];
  }

  try {
    const supabase = createClient(config.url, config.key);

    // 1. Pehle folder ke andar check karega
    let { data: files, error } = await supabase.storage
      .from(config.bucket)
      .list(config.folder, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' }
      });

    let currentPath = config.folder;

    // 2. Agar folder me na mile, toh direct bucket ke root me check karega
    if (!files || files.length === 0) {
      const rootRes = await supabase.storage
        .from(config.bucket)
        .list('', {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' }
        });
      files = rootRes.data || [];
      currentPath = '';
    }

    if (error && (!files || files.length === 0)) {
      console.error(`[ERROR] ${config.playlist}:`, error.message);
      return [];
    }

    const audioFiles = files.filter(f =>
      f.name &&
      !f.name.startsWith('.') &&
      f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)
    );

    console.log(`[SUCCESS] ${config.playlist}: Loaded ${audioFiles.length} songs.`);

    return audioFiles.map((file, index) => {
      const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
      const { data: urlData } = supabase.storage
        .from(config.bucket)
        .getPublicUrl(filePath);

      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/_/g, ' ')
        .trim();

      return {
        id: `${config.playlist.toLowerCase().replace(/[^a-z0-9]/g, '')}_${index + 1}`,
        title: cleanTitle,
        url: urlData.publicUrl,
        playlist: config.playlist,
        size: file.metadata?.size || 0
      };
    });
  } catch (err) {
    console.error(`[EXCEPTION] ${config.playlist}:`, err.message);
    return [];
  }
}

app.get('/', (req, res) => {
  res.send('Vision Music Multi-Supabase Backend is running smoothly!');
});

app.get('/songs', async (req, res) => {
  try {
    const results = await Promise.all(
      ACCOUNTS_CONFIG.map(cfg => fetchPlaylistSongs(cfg))
    );

    const allSongs = results.flat();
    console.log(`[TOTAL SERVED] ${allSongs.length} songs.`);
    res.json(allSongs);
  } catch (error) {
    console.error('[FATAL SERVER ERROR]:', error);
    res.status(500).json({ error: 'Server error fetching songs' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
