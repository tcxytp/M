const express = require('express');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');

const app = express();
app.use(cors());

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
  secure: true
});

app.get('/songs', async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression('resource_type:video')
      .max_results(200)
      .execute();

    const songs = result.resources.map(file => {
      // public_id jaise "Hindi Song's/tum_hi_ho"
      const parts = file.public_id.split('/');
      let playlist = 'Other';
      let title = file.public_id;

      if (parts.length > 1) {
        playlist = parts[0]; // Pehla hissa folder ka naam hoga
        title = parts.slice(1).join('/'); // Baaki hissa gaane ka naam
      }

      return {
        id: file.public_id,
        title: title.replace(/_/g, ' '), // Underline hatakar clean title
        url: file.secure_url,
        playlist: playlist
      };
    });

    res.json(songs);
  } catch (error) {
    console.error('Error fetching from Cloudinary:', error);
    res.status(500).json({ error: 'Failed to fetch songs' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
