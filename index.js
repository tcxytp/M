import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 4 Alag Supabase Accounts ka Configuration
const ACCOUNTS_CONFIG = [
  {
    playlist: "Hindi Song's",
    url: process.env.SUPABASE_URL_1 || process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY_1 || process.env.SUPABASE_KEY,
    bucket: 'songs'
  },
  {
    playlist: "English Song's",
    url: process.env.SUPABASE_URL_2,
    key: process.env.SUPABASE_KEY_2,
    bucket: 'songs'
  },
  {
    playlist: "FF Song's",
    url: process.env.SUPABASE_URL_3,
    key: process.env.SUPABASE_KEY_3,
    bucket: 'songs'
  },
  {
    playlist: "Phonk Song's",
    url: process.env.SUPABASE_URL_4,
    key: process.env.SUPABASE_KEY_4,
    bucket: 'songs'
  }
];

// Helper: Kisi ek Supabase bucket se gaane fetch karna
async function fetchPlaylistSongs(config) {
  if (!config.url || !config.key) {
    console.warn(`Credentials missing for playlist: ${config.playlist}`);
    return [];
  }

  try {
    const supabase = createClient(config.url, config.key);
    
    // Bucket ki files list karein
    const { data: files, error } = await supabase.storage.from(config.bucket).list('', {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' }
    });

    if (error) {
      console.error(`Error fetching ${config.playlist}:`, error.message);
      return [];
    }

    // Sirf valid audio files filter karein
    const audioFiles = files.filter(f => 
      f.name && 
      !f.name.startsWith('.') && 
      f.name.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)
    );

    return audioFiles.map((file, index) => {
      // Public direct stream URL generate karein
      const { data: urlData } = supabase.storage.from(config.bucket).getPublicUrl(file.name);

      // Clean Song Title (File extension hatana)
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

      return {
        id: `${config.playlist.toLowerCase().replace(/[^a-z0-9]/g, '')}_${index + 1}`,
        title: cleanTitle,
        url: urlData.publicUrl,
        playlist: config.playlist,
        size: file.metadata?.size || 0
      };
    });
  } catch (err) {
    console.error(`Fetch exception on ${config.playlist}:`, err.message);
    return [];
  }
}

// Health check route
app.get('/', (req, res) => {
  res.send('Vision Music Multi-Supabase Backend is running smoothly!');
});

// Main Songs API Route (Parallel fetching from all 4 accounts)
app.get('/songs', async (req, res) => {
  try {
    // Chaaro accounts se ek sath parallel fetch karein fastest speed ke liye
    const results = await Promise.all(
      ACCOUNTS_CONFIG.map(cfg => fetchPlaylistSongs(cfg))
    );

    // Sabhi playlists ke gaano ko ek single flat list me combine karein
    const allSongs = results.flat();

    res.json(allSongs);
  } catch (error) {
    console.error('Fatal API Error:', error);
    res.status(500).json({ error: 'Failed to fetch songs from accounts' });
  }
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
