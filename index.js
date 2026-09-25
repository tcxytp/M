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
      // Cloudinary folder name property check
      let folderName = file.asset_folder || file.folder || '';

      // Agar folder property na mile to public_id path se check karein
      if (!folderName && file.public_id.includes('/')) {
        folderName = file.public_id.split('/')[0];
      }

      // Title nikalna
      const cleanTitle = (file.filename || file.public_id.split('/').pop()).replace(/_/g, ' ');

      return {
        id: file.public_id,
        title: cleanTitle,
        url: file.secure_url,
        playlist: folderName || 'Other'
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
