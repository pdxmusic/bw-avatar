const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const blendShapeNames = require('./blendshapeNames');
const _ = require('lodash');

// Helper: generate a random string
function randomString() {
  return Math.random().toString(36).slice(2, 7);
}

// Mappatura estesa per fonemi italiani comuni
function phonemeToBlendshapeExtended(phoneme) {
    phoneme = phoneme.replace(/['_:]/g, ''); // Rimuovi indicatori di accento/lunghezza

    // Valori più alti per apertura e chiusura
    if (phoneme.match(/^[aA]|ao$/)) return { jawOpen: 0.8, mouthClose: 0.1 }; // Aggiunto 'ao' qui
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
  console.log(`[generateVisemes] Start. Text: "${text}", Duration: ${audioDurationSec}s`);
  return new Promise(async (resolve, reject) => {
    const tempDir = path.join(__dirname, '../public');
    const rand = randomString();
    const wavOutputPath = path.join(tempDir, `speech-${rand}.wav`);
    const jsonOutputPath = path.join(tempDir, `phonemes-${rand}.json`);
    const pythonScriptPath = path.join(__dirname, '../../talking_avatar_backend_aenas/helpers/coqui_tts_phonemes.py');
    const blendshapesFilename = `blendshapes-${rand}.json`;
    const blendshapesFilePath = path.join(tempDir, blendshapesFilename);

    console.log(`[generateVisemes] Paths defined:
      - Temp Dir: ${tempDir}
      - WAV Output: ${wavOutputPath}
      - JSON Output: ${jsonOutputPath}
      - Python Script: ${pythonScriptPath}
      - Blendshapes Output: ${blendshapesFilePath}`);

    try {
      // 1. Execute the Python script (generates audio and phoneme list JSON)
      const escapedText = text.replace(/"/g, '\"');
      const pythonCmd = `python "${pythonScriptPath}" "${escapedText}" "${wavOutputPath}" "${jsonOutputPath}"`;
      console.log(`[generateVisemes] Executing Python command: ${pythonCmd}`);

      try {
        const scriptOutput = execSync(pythonCmd, { encoding: 'utf8', stdio: 'pipe' }); // Use pipe to capture output/error
        console.log("[generateVisemes] Python script execution successful.");
        console.log("--- Python Script STDOUT ---");
        console.log(scriptOutput);
        console.log("----------------------------");
        // Check if JSON file exists immediately after script execution
        if (!fs.existsSync(jsonOutputPath)) {
            console.error(`[generateVisemes] ERROR: Python script finished but JSON file NOT FOUND at: ${jsonOutputPath}`);
            // Attempt to clean up WAV if it exists
            if (fs.existsSync(wavOutputPath)) {
                try { fs.unlinkSync(wavOutputPath); } catch (e) { console.error("Error cleaning up WAV:", e); }
            }
            return reject(new Error(`Python script finished but JSON file was not created at ${jsonOutputPath}. Script output: ${scriptOutput}`));
        } else {
            console.log(`[generateVisemes] JSON file FOUND at: ${jsonOutputPath}`);
        }

      } catch (pyErr) {
        console.error("[generateVisemes] Error executing Python script:", pyErr);
        const stdout = pyErr.stdout ? pyErr.stdout.toString() : 'N/A';
        const stderr = pyErr.stderr ? pyErr.stderr.toString() : 'N/A';
        console.error("--- Python STDOUT (on error) ---");
        console.error(stdout);
        console.error("--- Python STDERR (on error) ---");
        console.error(stderr);
        console.error("--------------------------------");
        // Clean up potentially created files
        if (fs.existsSync(wavOutputPath)) try { fs.unlinkSync(wavOutputPath); } catch (e) { console.error("Error cleaning up WAV on pyErr:", e); }
        if (fs.existsSync(jsonOutputPath)) try { fs.unlinkSync(jsonOutputPath); } catch (e) { console.error("Error cleaning up JSON on pyErr:", e); }
        return reject(new Error(`Python script execution failed: ${pyErr.message}. Stderr: ${stderr}`));
      }

      // 2. Read the generated phoneme JSON file (expecting array of strings)
      let phonemeList;
      let rawJsonData = '';
      try {
        console.log(`[generateVisemes] Attempting to read JSON file: ${jsonOutputPath}`);
        rawJsonData = fs.readFileSync(jsonOutputPath, 'utf8');
        console.log(`[generateVisemes] Raw JSON data read successfully. Content length: ${rawJsonData.length}`);
        console.log("--- Raw JSON Content ---");
        console.log(rawJsonData);
        console.log("------------------------");
        phonemeList = JSON.parse(rawJsonData);
        console.log(`[generateVisemes] JSON parsed successfully.`);
        if (!Array.isArray(phonemeList)) {
            console.error("[generateVisemes] ERROR: Parsed JSON data is not an array.");
            throw new Error('Phoneme JSON content is not an array.');
        }
        console.log(`[generateVisemes] Parsed phoneme list (count: ${phonemeList.length}): [${phonemeList.join(', ')}]`);
      } catch (readErr) {
        console.error(`[generateVisemes] Error reading or parsing phoneme JSON file (${jsonOutputPath}):`, readErr);
        console.error(`[generateVisemes] Raw JSON data before parse attempt: ${rawJsonData}`); // Log raw data on error
        // Clean up
        if (fs.existsSync(wavOutputPath)) try { fs.unlinkSync(wavOutputPath); } catch (e) { console.error("Error cleaning up WAV on readErr:", e); }
        if (fs.existsSync(jsonOutputPath)) try { fs.unlinkSync(jsonOutputPath); } catch (e) { console.error("Error cleaning up JSON on readErr:", e); }
        return reject(new Error(`Failed to read/parse phoneme JSON: ${readErr.message}`));
      }

      // 3. Clean up temporary files (JSON and WAV)
      try {
        console.log(`[generateVisemes] Attempting to delete temporary files: ${wavOutputPath}, ${jsonOutputPath}`);
        if (fs.existsSync(wavOutputPath)) fs.unlinkSync(wavOutputPath);
        if (fs.existsSync(jsonOutputPath)) fs.unlinkSync(jsonOutputPath);
        console.log(`[generateVisemes] Temporary files deleted successfully.`);
      } catch (unlinkErr) {
        // Log error but don't fail the whole process if cleanup fails
        console.error("[generateVisemes] Warning: Error deleting temporary output files:", unlinkErr);
      }

      // 4. Generate blendshape keyframes using uniform duration BUT at a fixed FPS
      if (phonemeList.length === 0) {
        console.warn("[generateVisemes] Warning: Phoneme list is empty. Returning null URL.");
        return resolve({ blendshapesUrl: null });
      }

      const durationPerPhonemeSec = audioDurationSec / phonemeList.length;
      console.log(`[generateVisemes] Calculated uniform duration per phoneme: ${durationPerPhonemeSec.toFixed(4)}s`);

      if (durationPerPhonemeSec <= 0) {
        console.warn("[generateVisemes] Warning: Calculated duration per phoneme is zero or negative. Returning null URL.");
        return resolve({ blendshapesUrl: null });
      }

      const TARGET_FPS = 60;
      const timeStep = 1 / TARGET_FPS;
      console.log(`[generateVisemes] Generating frames at ${TARGET_FPS} FPS (time step: ${timeStep.toFixed(4)}s)`);

      let blendData = [];
      let currentPhonemeStartTime = 0;
      const neutralPose = blendShapeNames.reduce((acc, name) => ({ ...acc, [name]: 0.0 }), {});

      console.log("[generateVisemes] Adding initial neutral frame at time 0.");
      blendData.push({ time: 0, blendshapes: { ...neutralPose } });

      phonemeList.forEach((phoneme, index) => {
        const targetShapes = phonemeToBlendshapeExtended(phoneme);
        const currentPhonemeEndTime = currentPhonemeStartTime + durationPerPhonemeSec;

        console.log(`[generateVisemes] Processing Phoneme ${index + 1}: "${phoneme}", Time Slot: ${currentPhonemeStartTime.toFixed(4)}s - ${currentPhonemeEndTime.toFixed(4)}s`);

        // Iterate through the time slot for this phoneme at the target FPS
        for (let frameTime = currentPhonemeStartTime; frameTime < currentPhonemeEndTime; frameTime += timeStep) {
          // For simplicity, apply the target shape for the entire duration of the phoneme slot
          const frameShapes = { ...neutralPose, ...targetShapes };
          const roundedFrameTime = +frameTime.toFixed(4); // Round to 4 decimal places

          // Add the frame, avoiding adding exactly at the start time if it's not the very first frame (t=0)
          if (roundedFrameTime > 0) {
             blendData.push({ time: roundedFrameTime, blendshapes: frameShapes });
          }
        }

        // Update start time for the next phoneme
        currentPhonemeStartTime = currentPhonemeEndTime;
      });

      // Ensure the final frame is exactly at the target duration with a neutral pose
      const finalTime = +audioDurationSec.toFixed(4);
      console.log(`[generateVisemes] Adding final neutral frame at time ${finalTime}`);
      blendData.push({ time: finalTime, blendshapes: { ...neutralPose } });

      // 5. Clean up and sort blendData
      console.log(`[generateVisemes] Cleaning blendData. Initial frame count: ${blendData.length}`);
      blendData = _.uniqWith(blendData.reverse(), (a, b) => a.time === b.time).reverse();
      console.log(`[generateVisemes] Frame count after uniqWith: ${blendData.length}`);
      blendData = _.sortBy(blendData, 'time');
      console.log(`[generateVisemes] Frame count after sortBy: ${blendData.length}`);

      // Ensure first frame is at time 0 and neutral (should already be the case, but double-check)
      if (blendData.length === 0 || blendData[0].time !== 0) {
          console.log("[generateVisemes] Prepending neutral frame at t=0 as it was missing.");
          blendData.unshift({ time: 0, blendshapes: { ...neutralPose } });
      } else if (!_.isEqual(blendData[0].blendshapes, neutralPose)) {
          console.log("[generateVisemes] Ensuring first frame at t=0 is neutral.");
          blendData[0].blendshapes = { ...neutralPose };
      }

      console.log(`[generateVisemes] Final blendData frame count: ${blendData.length}.`);

      // 6. Write final blendshape data to JSON
      const blendshapesUrlPath = `/${blendshapesFilename}`;
      try {
        console.log(`[generateVisemes] Attempting to write final blendshape data to: ${blendshapesFilePath}`);
        fs.writeFileSync(blendshapesFilePath, JSON.stringify(blendData, null, 2)); // Pretty print for readability
        console.log(`[generateVisemes] Blendshape data written successfully to ${blendshapesFilePath}`);
        console.log(`[generateVisemes] PRE-RESOLVE CHECK: blendshapesUrlPath = ${blendshapesUrlPath}`);
        resolve({ blendshapesUrl: blendshapesUrlPath });
      } catch (writeErr) {
        console.error("[generateVisemes] Error writing final blendshape JSON:", writeErr);
        reject(new Error(`Failed to write blendshape JSON: ${writeErr.message}`));
      }

    } catch (error) {
      console.error("[generateVisemes] Unhandled error in generateVisemes:", error);
      reject(error);
    }
  });
};

module.exports = { generateVisemes };