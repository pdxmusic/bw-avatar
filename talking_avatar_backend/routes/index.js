var express = require('express');
var router = express.Router();
// Import both generation functions with distinct names
const { generateVisemes: generateVisemesPython } = require('../helpers/tts_python');
const { generateVisemes: generateVisemesEspeak } = require('../helpers/tts_espeak');

/* POST route per generare visemi */
router.post('/talk', async (req, res, next) => {
  // Destructure text, duration, and mode from the request body
  const { text, duration, mode } = req.body;

  // Validate input
  if (!text || duration === undefined || !mode) {
    return res.status(400).json({ error: 'Missing text, duration, or mode in request body' });
  }

  // Validate mode
  if (mode !== 'python' && mode !== 'espeak') {
    return res.status(400).json({ error: 'Invalid mode specified. Use "python" or "espeak".' });
  }

  try {
    console.log(`Received /talk request: text="${text}", duration=${duration}, mode=${mode}`);

    let result;
    // Choose the generation function based on the mode
    if (mode === 'python') {
      console.log('Using Python (Coqui TTS + espeak) mode.');
      result = await generateVisemesPython(text, duration);
    } else { // mode === 'espeak'
      console.log('Using Espeak direct mode.');
      result = await generateVisemesEspeak(text, duration);
    }

    const { blendshapesUrl } = result;
    console.log(`Visemes generated (mode: ${mode}), blendshapes URL: ${blendshapesUrl}`);

    // Respond with the URL to the blendshape file
    res.json({ blendshapesUrl });

  } catch (error) {
    console.error(`Error processing /talk request (mode: ${mode}):`, error);
    res.status(500).json({ error: 'Failed to generate visemes', details: error.message });
  }
});

module.exports = router;