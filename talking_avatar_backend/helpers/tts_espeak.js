const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const blendShapeNames = require('./blendshapeNames');
const _ = require('lodash');

// Helper: generate a random string
function randomString() {
  return Math.random().toString(36).slice(2, 7);
}

// Parses espeak output. Handles --pho format (preferred) or -x format (fallback).
function parsePhonemesWithTiming(espeakOutput) {
  console.log("--- Parsing Espeak Output ---");
  console.log(espeakOutput);
  console.log("---------------------------");
  const lines = espeakOutput.trim().split('\n');
  const phonemes = [];

  // Try parsing --pho format first (line by line: <phoneme> <duration> <...>)
  let isPhoFormat = false;
  for (const line of lines) {
    const phoMatch = line.match(/^\s*([a-zA-Z]+[_\d]?\*?)\s+(\d+)/);
    if (phoMatch) {
      isPhoFormat = true;
      const phoneme = phoMatch[1].replace('*', ''); // Remove emphasis marker if present
      const durationMs = parseInt(phoMatch[2], 10);
      if (phoneme && !isNaN(durationMs)) {
        phonemes.push({ phoneme, durationMs });
      }
    } else {
      // If we started parsing pho format and encounter a non-matching line, stop
      if (isPhoFormat) break;
    }
  }

  // If --pho parsing yielded results, return them
  if (phonemes.length > 0 && isPhoFormat) {
    console.log("Parsed using --pho format.");
    return phonemes;
  }

  // Fallback: Try parsing -x format (single line, space-separated, may have stress/punctuation)
  console.log("Attempting fallback parsing for -x format...");
  phonemes.length = 0; // Clear any previous attempts
  const xOutputLine = lines.join(' ').trim(); // Join lines in case -x output wraps

  // Split by whitespace, then clean up each phoneme part
  const xPhonemesRaw = xOutputLine.split(/\s+/);
  const xPhonemes = xPhonemesRaw.map(p => {
      // Remove primary (') and secondary (,) stress markers
      // Also remove potential boundary markers like _ if they appear attached
      return p.replace(/[',_?]/g, '');
  }).filter(p => p && p.length > 0); // Keep only non-empty strings after cleaning

  if (xPhonemes.length > 0) {
    console.log(`Parsed using -x format (no timing): ${xPhonemes.join(' ')}`);
    xPhonemes.forEach(p => phonemes.push({ phoneme: p, durationMs: null })); // Duration is initially null
    return phonemes;
  }

  console.warn("Could not parse espeak output in --pho or -x format.");
  return [];
}

// Mappatura estesa per fonemi italiani comuni
// AUMENTIAMO I VALORI TARGET per movimenti più pronunciati
function phonemeToBlendshapeExtended(phoneme) {
    phoneme = phoneme.replace(/['_:]/g, ''); // Rimuovi indicatori di accento/lunghezza

    // Valori più alti per apertura e chiusura
    if (phoneme.match(/^[aA]$/)) return { jawOpen: 0.8, mouthClose: 0.1 };
    if (phoneme.match(/^[eEɛ]$/)) return { jawOpen: 0.6, mouthStretchLeft: 0.5, mouthStretchRight: 0.5, mouthClose: 0.2 }; // e/E/ɛ
    if (phoneme.match(/^[iI]$/)) return { jawOpen: 0.3, mouthStretchLeft: 0.8, mouthStretchRight: 0.8, mouthClose: 0.1 };
    if (phoneme.match(/^[oOɔ]$/)) return { jawOpen: 0.6, mouthPucker: 0.7, mouthFunnel: 0.5, mouthClose: 0.1 }; // o/O/ɔ
    if (phoneme.match(/^[uU]$/)) return { jawOpen: 0.4, mouthPucker: 0.9, mouthFunnel: 0.6, mouthClose: 0.1 };
    if (phoneme.match(/^(tS|dZ|S|Z)$/)) return { mouthPucker: 0.5, jawOpen: 0.3, mouthShrugUpper: 0.6, mouthClose: 0.2 }; // ts, dz, sh, zh
    if (phoneme.match(/^[pbm]$/)) return { mouthClose: 1.0, jawOpen: 0.05 }; // Bilabiali - chiusura forte
    if (phoneme.match(/^[fv]$/)) return { mouthShrugUpper: 0.8, jawOpen: 0.2, mouthClose: 0.3 }; // Labiodentali
    if (phoneme.match(/^[tdn]$/)) return { jawOpen: 0.2, mouthShrugUpper: 0.7, mouthClose: 0.3 }; // Alveolari
    if (phoneme.match(/^[kgN]$/)) return { jawOpen: 0.4, mouthClose: 0.2 }; // Velari (N = ng)
    if (phoneme.match(/^[lr]$/)) return { jawOpen: 0.3, tongueOut: 0.5, mouthClose: 0.2 }; // Liquide
    if (phoneme.match(/^[J]$/)) return { jawOpen: 0.3, mouthStretchLeft: 0.4, mouthStretchRight: 0.4, mouthClose: 0.2 }; // 'gn'
    if (phoneme.match(/^[L]$/)) return { jawOpen: 0.3, tongueOut: 0.4, mouthClose: 0.2 }; // 'gli'
    if (phoneme.match(/^[sz]$/)) return { jawOpen: 0.2, mouthStretchLeft: 0.3, mouthStretchRight: 0.3, mouthShrugUpper: 0.5, mouthClose: 0.3 }; // Sibilanti
    if (phoneme.match(/^[wj]$/)) return { jawOpen: 0.3, mouthPucker: 0.6, mouthFunnel: 0.4 }; // w, j (semi-vowels)

    // fallback: bocca rilassata/leggermente chiusa
    return { jawOpen: 0.05, mouthClose: 0.1 };
}

// Funzione principale per generare visemi (blendshapes)
const generateVisemes = async (text, audioDurationSec) => {
  console.log(`Generating visemes for text: "${text}" with duration: ${audioDurationSec}s`);
  return new Promise(async (resolve, reject) => {
    let phonemes = [];
    const tempDir = path.join(__dirname, '../public');
    const rand = randomString();
    const inputTextPath = path.join(tempDir, `input-${rand}.txt`);

    try {
      // 1. Write input text to a temporary file
      try {
        fs.writeFileSync(inputTextPath, text, 'utf8');
        console.log(`Input text written to ${inputTextPath}`);
      } catch (writeErr) {
        console.error("Error writing temporary input file:", writeErr);
        return reject(new Error(`Failed to write temporary input file: ${writeErr.message}`));
      }

      // 2. Execute espeak-ng using input file (--pho flag) and capture output
      let espeakOutput;
      try {
        // Use espeak-ng and --pho flag
        const espeakCmd = `espeak-ng -v it -f \"${inputTextPath}\" -w /dev/null --pho 2>&1`;
        console.log(`Executing command: ${espeakCmd}`);
        espeakOutput = execSync(espeakCmd, { encoding: 'utf8' });
        console.log(`Espeak-ng execution successful.`);
        console.log("--- Raw Espeak-ng Combined Output (--pho) ---");
        console.log(espeakOutput);
        console.log("-------------------------------------------");
      } catch (execErr) {
        console.error("Error executing espeak-ng:", execErr);
        const stdoutContent = execErr.stdout ? execErr.stdout.toString() : 'N/A';
        const stderrContent = execErr.stderr ? execErr.stderr.toString() : 'N/A';
        console.error("Espeak-ng stdout on error:", stdoutContent);
        console.error("Espeak-ng stderr on error:", stderrContent);
        try { fs.unlinkSync(inputTextPath); } catch (unlinkErr) { console.error("Error deleting temp input file on exec error:", unlinkErr); }
        return reject(new Error(`Espeak-ng execution failed: ${execErr.message}. Stderr: ${stderrContent}`));
      }

      // 3. Parse the captured espeak-ng output (should be --pho format)
      if (!espeakOutput || espeakOutput.trim().length === 0) {
        console.warn("Espeak-ng command produced no output.");
        try { fs.unlinkSync(inputTextPath); } catch (unlinkErr) { console.error("Error deleting temp input file on no output:", unlinkErr); }
        return resolve({ blendshapesUrl: null }); // Resolve with null URL if no output
      }

      phonemes = parsePhonemesWithTiming(espeakOutput);

      // 4. Estimate timing if using -x fallback
      const hasNullDurations = phonemes.some(p => p.durationMs === null);
      let totalPhonemeDurationMs = 0;

      if (hasNullDurations && phonemes.length > 0 && audioDurationSec > 0) {
        console.log(`Estimating phoneme durations based on total audio duration: ${audioDurationSec}s`);
        const estimatedDurationMs = (audioDurationSec * 1000) / phonemes.length;
        phonemes.forEach(p => {
          p.durationMs = estimatedDurationMs;
        });
        totalPhonemeDurationMs = audioDurationSec * 1000;
        console.log(`Assigned estimated duration: ${estimatedDurationMs.toFixed(2)}ms per phoneme.`);
      } else if (!hasNullDurations) {
        // Calculate total duration from --pho data if available
        totalPhonemeDurationMs = phonemes.reduce((sum, p) => sum + p.durationMs, 0);
        console.log(`Using durations from --pho output. Total: ${totalPhonemeDurationMs}ms`);
      }

      console.log("Phonemes with durations:", JSON.stringify(phonemes, null, 2));

      // 5. Clean up temporary input file
      try {
        fs.unlinkSync(inputTextPath);
        console.log(`Temporary input file ${inputTextPath} deleted.`);
      } catch (unlinkErr) {
        console.error("Error deleting temporary input file:", unlinkErr);
      }

      // 6. Generate blendshape keyframes from phonemes
      if (phonemes.length === 0) {
        console.warn("Warning: No phonemes extracted or processed.");
        // Return empty blendData or a default neutral pose if desired
        // For now, resolving with null URL as no data generated
        return resolve({ blendshapesUrl: null });
      }

      let blendData = [];
      let currentTimeSec = 0;
      const neutralPose = blendShapeNames.reduce((acc, name) => ({ ...acc, [name]: 0.0 }), {});
      blendData.push({ time: 0, blendshapes: { ...neutralPose } });

      phonemes.forEach(({ phoneme, durationMs }) => {
        if (durationMs <= 0) return; // Skip if duration is zero or invalid
        const durationSec = durationMs / 1000;
        const targetShapes = phonemeToBlendshapeExtended(phoneme);
        const frameShapes = { ...neutralPose };
        for (const shapeName in targetShapes) {
          if (blendShapeNames.includes(shapeName)) {
            frameShapes[shapeName] = targetShapes[shapeName];
          }
        }

        // Apply shape slightly after the start time
        const startTime = currentTimeSec + 0.01;
        blendData.push({ time: +startTime.toFixed(4), blendshapes: frameShapes });

        currentTimeSec += durationSec;

        // Return to neutral slightly before the end time
        const endTime = currentTimeSec - 0.01;
        if (endTime > startTime) {
             blendData.push({ time: +endTime.toFixed(4), blendshapes: { ...neutralPose } });
        }
      });

      // Scaling logic (only needed if using --pho timings that don't match audioDurationSec)
      const lastTimeEspeak = currentTimeSec;
      if (!hasNullDurations && lastTimeEspeak > 0 && audioDurationSec > 0 && Math.abs(lastTimeEspeak - audioDurationSec) > 0.05) {
          // Only scale if using --pho timings AND they differ significantly from audioDurationSec
          const scaleFactor = audioDurationSec / lastTimeEspeak;
          console.log(`Scaling blendData times (--pho). Espeak total: ${lastTimeEspeak.toFixed(4)}s, Target duration: ${audioDurationSec.toFixed(4)}s, Scale factor: ${scaleFactor.toFixed(4)}`);
          blendData.forEach(frame => {
              frame.time *= scaleFactor;
              frame.time = +frame.time.toFixed(4);
          });
      } else if (hasNullDurations) {
          console.log("Skipping time scaling (used estimated durations).");
      } else {
          console.log("Skipping time scaling (--pho duration matches target or zero duration).");
      }

      // Ensure final frame is at the target duration
      blendData.push({ time: +audioDurationSec.toFixed(4), blendshapes: { ...neutralPose } });

      // Clean up blendData: remove duplicates, sort, filter out times beyond duration
      blendData = _.uniqBy(blendData, 'time');
      blendData = _.sortBy(blendData, 'time');
      blendData = blendData.filter(frame => frame.time <= audioDurationSec);

      console.log(`DEBUG: Generated ${blendData.length} blendshape frames.`);
      if(blendData.length > 10) {
          console.log('BlendData generato (primi 5):\n', JSON.stringify(blendData.slice(0, 5), null, 2));
          console.log('BlendData generato (...ultimi 5):\n', JSON.stringify(blendData.slice(-5), null, 2));
      } else {
          console.log('BlendData generato:\n', JSON.stringify(blendData, null, 2));
      }

      // 7. Save blendData to a JSON file
      const blendshapesFilename = `blendshapes-${rand}.json`;
      const blendshapesFilePath = path.join(tempDir, blendshapesFilename);
      const blendshapesUrlPath = `/${blendshapesFilename}`; // Relative path for URL

      try {
        fs.writeFileSync(blendshapesFilePath, JSON.stringify(blendData, null, 2), 'utf8');
        console.log(`Blendshape data written to ${blendshapesFilePath}`);
      } catch (writeErr) {
        console.error("Error writing blendshape JSON file:", writeErr);
        // Clean up input file even if JSON writing fails
        try { fs.unlinkSync(inputTextPath); } catch (unlinkErr) { console.error("Error deleting temp input file on JSON write error:", unlinkErr); }
        return reject(new Error(`Failed to write blendshape JSON file: ${writeErr.message}`));
      }

      // Resolve with the URL path to the blendshape file
      resolve({ blendshapesUrl: blendshapesUrlPath });

    } catch (err) {
      console.error('Errore nella generazione dei visemi:', err);
      if (fs.existsSync(inputTextPath)) {
         try { fs.unlinkSync(inputTextPath); } catch (e) { console.error("Errore pulizia file input:", e);}
      }
      reject(err);
    }
  });
};

module.exports = generateVisemes;