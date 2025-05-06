const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

/**
 * Test della chiamata TTS a Brainyware API
 * Questa funzione invia una richiesta all'API text-to-speech e gestisce la risposta
 */
async function testTTSApi() {
  try {
    // Crea la cartella response se non esiste
    const responseDir = path.join(__dirname, '../response');
    if (!fs.existsSync(responseDir)) {
      fs.mkdirSync(responseDir, { recursive: true });
      console.log(`Cartella creata: ${responseDir}`);
    }

    const url = 'https://dev.brainyware.ai/bw-avatar/tts-dev';
    const formData = new FormData();
    
    // Aggiungi i parametri come specificato nella chiamata curl
    formData.append('text', 'Ciao sono  un avatar parlante');
    formData.append('language', 'it');
    formData.append('voice', 'male_it.wav');
    
    console.log('Invio richiesta a:', url);
    
    const response = await axios({
      method: 'post',
      url: url,
      data: formData,
      headers: {
        ...formData.getHeaders(),
      },
      // Ignora errori SSL (equivalente all'opzione -k in curl)
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
    });
    
    // Gestisci la risposta
    console.log('Status della risposta:', response.status);
    
    if (response.data) {
      console.log('Risposta ricevuta con successo');
      
      // Salva il testo generato in un file
      const responseText = response.data.text;
      if (responseText) {
        console.log('Testo generato:', responseText);
        const textPath = path.join(responseDir, 'output_text.txt');
        fs.writeFileSync(textPath, responseText);
        console.log(`Testo salvato in: ${textPath}`);
      }
      
      // Gestisci l'audio
      if (response.data.audio) {
        console.log('Audio ricevuto');
        
        // Determina l'estensione del file in base al formato audio
        const audioFormat = response.data.audio_format || 'wav';
        const fileExtension = audioFormat.toLowerCase().includes('mp3') ? 'mp3' : 'wav';
        const outputPath = path.join(responseDir, `output_audio.${fileExtension}`);
        
        // Salva l'audio come file
        const audioBuffer = Buffer.from(response.data.audio, 'base64');
        fs.writeFileSync(outputPath, audioBuffer);
        console.log(`Audio salvato in: ${outputPath}`);
      }
      
      // Salva anche la risposta completa in formato JSON per riferimenti futuri
      const jsonPath = path.join(responseDir, 'response.json');
      const jsonData = { ...response.data };
      if (jsonData.audio) {
        // Rimuovi il contenuto binario base64 per evitare file troppo grandi
        jsonData.audio = `[Base64 audio, ${jsonData.audio.length} bytes]`;
      }
      fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
      console.log(`Risposta completa salvata in: ${jsonPath}`);
      
      // Log dettagliato della risposta
      console.log('Struttura della risposta:');
      for (const [key, value] of Object.entries(response.data)) {
        if (key === 'audio') {
          console.log(`- ${key}: [Base64 data, ${value.length} caratteri]`);
        } else {
          console.log(`- ${key}: ${value}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Errore durante la richiesta:', error.message);
    
    if (error.response) {
      // La richiesta è stata effettuata e il server ha risposto con uno status code
      // che non rientra nell'intervallo 2xx
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      console.error('Dati risposta:', error.response.data);
    }
  }
}

// Esegui il test
testTTSApi();