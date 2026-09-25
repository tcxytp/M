const express = require('express');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

cloudinary.config({ 
  cloud_name: process.env.CLOUD_NAME, 
  api_key: process.env.API_KEY, 
  api_secret: process.env.API_SECRET 
});

app.get('/songs', async (req, res) => {
  try {
    const result = await cloudinary.api.resources({ 
      resource_type: 'video', 
      max_results: 500 
    });
    const songs = result.resources.map(file => ({
      title: file.public_id,
      url: file.secure_url
    }));
    res.json(songs);
  } catch (error) {
    res.status(500).send('Error fetching songs');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
