const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BUCKET = process.env.SUPABASE_BUCKET || 'songs';

app.get('/songs', async (req, res) => {
  try {
    const folders = ["Hindi Song's", "English Song's", "FF Song's"];
    let allSongs = [];

    for (const folder of folders) {
      const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

      if (!error && data) {
        data
          .filter(file => file.name && file.name.match(/\.(mp3|wav|m4a|aac|ogg)$/i))
          .forEach(file => {
            const { data: urlData } = supabase.storage
              .from(BUCKET)
              .getPublicUrl(`${folder}/${file.name}`);

            const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

            allSongs.push({
              id: `${folder}/${file.name}`,
              title: cleanTitle,
              url: urlData.publicUrl,
              playlist: folder
            });
          });
      }
    }

    res.json(allSongs);
  } catch (error) {
    console.error('Error fetching from Supabase:', error);
    res.status(500).json({ error: 'Failed to fetch songs' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
