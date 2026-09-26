import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 4 Playlists Configuration with Fail-safe Fallbacks
const ACCOUNTS_CONFIG = [
  {
    playlist: "Hindi Song's",
    url: process.env.SUPABASE_URL_1 || process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY_1 || process.env.SUPABASE_KEY,
    bucket: process.env.SUPABASE_BUCKET_1 || process.env.SUPABASE_BUCKET || 'songs'
  },
  {
    playlist: "English Song's",
    url: process.env.SUPABASE_URL_2,
    key: process.env.SUPABASE_KEY_2,
    bucket: process.env.SUPABASE_BUCKET_2 || process.env.SUPABASE_BUCKET || 'songs'
  },
  {
    playlist: "FF Song's",
    url: process.env.SUPABASE_URL_3,
    key: process.env.SUPABASE_KEY_3,
    bucket: process.env.SUPABASE_BUCKET_3 || process.env.SUPABASE_BUCKET || 'songs'
  },
  {
    playlist: "Phonk Song's",
    url: process.env.SUPABASE_URL_4,
    key: process.env.SUPABASE_KEY_4,
    bucket: process.env.SUPABASE_BUCKET_4 || process.env.SUPABASE_BUCKET || 'songs'
  }
];

// Helper: Fetch songs safely from one Supabase bucket
async function fetchPlaylistSongs(config) {
  if (!config.url || !config.key) {
    return [];
  }

  try {
    const supabase = createClient(config.url, config.key);

    const { data: files, error } = await supabase.storage
      .from(config.bucket)
      .list('', {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error) {
      console.error(`[ERROR] ${config.playlist} bucket fetch failed:`, error.message);
      return [];
    }

    if (!files || files.length === 0) {
      console.log(`[INFO] ${config.playlist}: No files found in bucket "${config.bucket}"`);
      return [];
    }

    // Audio format filter
    const audioFiles = files.filter(f =>
      f.name &&
      !f.name.startsWith('.') &&
      f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)
    );

    console.log(`[SUCCESS] ${config.playlist}: Found ${audioFiles.length} audio tracks.`);

    return audioFiles.map((file, index) => {
      const { data: urlData } = supabase.storage
        .from(config.bucket)
        .getPublicUrl(file.name);

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

// Health Check Route
app.get('/', (req, res) => {
  res.send('Vision Music Multi-Supabase Backend is running smoothly!');
});

// Main API Route
app.get('/songs', async (req, res) => {
  try {
    // Parallel fetching from all configured accounts
    const results = await Promise.all(
      ACCOUNTS_CONFIG.map(cfg => fetchPlaylistSongs(cfg))
    );

    const allSongs = results.flat();
    console.log(`[API RESPONSE] Serving total ${allSongs.length} songs.`);
    res.json(allSongs);
  } catch (error) {
    console.error('[FATAL SERVER ERROR]:', error);
    res.status(500).json({ error: 'Server error fetching songs' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
