import React, { Suspense, useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, useTexture, Loader, Environment, useFBX, useAnimations, OrthographicCamera } from '@react-three/drei';
import { MeshStandardMaterial } from 'three/src/materials/MeshStandardMaterial';
import { SRGBColorSpace, LinearSRGBColorSpace } from 'three/src/constants';
import { LineBasicMaterial, MeshPhysicalMaterial, Vector2 } from 'three';
import ReactAudioPlayer from 'react-audio-player';

import { OrbitControls } from '@react-three/drei';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import createAnimation from './converter';
import blinkData from './blendDataBlink.json';

import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';

import './App.css'

import * as THREE from 'three';
import axios from 'axios';
const _ = require('lodash');

const host = 'http://localhost:5001';

function Avatar({ avatar_url, playing, setLoad, blendData }) {

  let gltf = useGLTF(avatar_url);
  let morphTargetDictionaryBody = null;
  let morphTargetDictionaryLowerTeeth = null;

  const [
    bodyTexture,
    eyesTexture,
    teethTexture,
    bodySpecularTexture,
    bodyRoughnessTexture,
    bodyNormalTexture,
    teethNormalTexture,
    hairTexture,
    tshirtDiffuseTexture,
    tshirtNormalTexture,
    tshirtRoughnessTexture,
    hairAlphaTexture,
    hairNormalTexture,
    hairRoughnessTexture,
  ] = useTexture([
    "/images/body.webp",
    "/images/eyes.webp",
    "/images/teeth_diffuse.webp",
    "/images/body_specular.webp",
    "/images/body_roughness.webp",
    "/images/body_normal.webp",
    "/images/teeth_normal.webp",
    "/images/h_color.webp",
    "/images/tshirt_diffuse.webp",
    "/images/tshirt_normal.webp",
    "/images/tshirt_roughness.webp",
    "/images/h_alpha.webp",
    "/images/h_normal.webp",
    "/images/h_roughness.webp",
  ]);

  _.each([
    bodyTexture,
    eyesTexture,
    teethTexture,
    teethNormalTexture,
    bodySpecularTexture,
    bodyRoughnessTexture,
    bodyNormalTexture,
    tshirtDiffuseTexture,
    tshirtNormalTexture,
    tshirtRoughnessTexture,
    hairAlphaTexture,
    hairNormalTexture,
    hairRoughnessTexture
  ], t => {
    t.colorSpace = SRGBColorSpace;
    t.flipY = false;
  });

  bodyNormalTexture.colorSpace = LinearSRGBColorSpace;
  tshirtNormalTexture.colorSpace = LinearSRGBColorSpace;
  teethNormalTexture.colorSpace = LinearSRGBColorSpace;
  hairNormalTexture.colorSpace = LinearSRGBColorSpace;

  gltf.scene.traverse(node => {
    if (node.type === 'Mesh' || node.type === 'LineSegments' || node.type === 'SkinnedMesh') {
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;

      if (node.name.includes("Body")) {
        node.castShadow = true;
        node.receiveShadow = true;

        node.material = new MeshPhysicalMaterial();
        node.material.map = bodyTexture;
        node.material.roughness = 1.7;
        node.material.roughnessMap = bodyRoughnessTexture;
        node.material.normalMap = bodyNormalTexture;
        node.material.normalScale = new Vector2(0.6, 0.6);

        morphTargetDictionaryBody = node.morphTargetDictionary;

        node.material.envMapIntensity = 0.8;
      }

      if (node.name.includes("Eyes")) {
        node.material = new MeshStandardMaterial();
        node.material.map = eyesTexture;
        node.material.roughness = 0.1;
        node.material.envMapIntensity = 0.5;
      }

      if (node.name.includes("Brows")) {
        node.material = new LineBasicMaterial({ color: 0x000000 });
        node.material.linewidth = 1;
        node.material.opacity = 0.5;
        node.material.transparent = true;
        node.visible = false;
      }

      if (node.name.includes("Teeth")) {
        node.receiveShadow = true;
        node.castShadow = true;
        node.material = new MeshStandardMaterial();
        node.material.roughness = 0.1;
        node.material.map = teethTexture;
        node.material.normalMap = teethNormalTexture;
        node.material.envMapIntensity = 0.7;
      }

      if (node.name.includes("Hair")) {
        node.material = new MeshStandardMaterial();
        node.material.map = hairTexture;
        node.material.alphaMap = hairAlphaTexture;
        node.material.normalMap = hairNormalTexture;
        node.material.roughnessMap = hairRoughnessTexture;

        node.material.transparent = true;
        node.material.depthWrite = false;
        node.material.side = 2;
        node.material.color.setHex(0x000000);

        node.material.envMapIntensity = 0.3;
      }

      if (node.name.includes("TSHIRT")) {
        node.material = new MeshStandardMaterial();
        node.material.map = tshirtDiffuseTexture;
        node.material.roughnessMap = tshirtRoughnessTexture;
        node.material.normalMap = tshirtNormalTexture;
        node.material.color.setHex(0xffffff);
        node.material.envMapIntensity = 0.5;
      }

      if (node.name.includes("TeethLower")) {
        morphTargetDictionaryLowerTeeth = node.morphTargetDictionary;
      }
    }
  });

  const mixer = useMemo(() => new THREE.AnimationMixer(gltf.scene), [gltf.scene]);

  let idleFbx = useFBX('/idle.fbx');
  let { clips: idleClips } = useAnimations(idleFbx.animations);

  idleClips[0].tracks = _.filter(idleClips[0].tracks, track => {
    return track.name.includes("Head") || track.name.includes("Neck") || track.name.includes("Spine2");
  });

  idleClips[0].tracks = _.map(idleClips[0].tracks, track => {
    if (track.name.includes("Head")) {
      track.name = "head.quaternion";
    }

    if (track.name.includes("Neck")) {
      track.name = "neck.quaternion";
    }

    if (track.name.includes("Spine")) {
      track.name = "spine2.quaternion";
    }

    return track;
  });

  useEffect(() => {
    let idleClipAction = mixer.clipAction(idleClips[0]);
    idleClipAction.play();

    let blinkClip = createAnimation(blinkData, morphTargetDictionaryBody, 'HG_Body');
    let blinkAction = mixer.clipAction(blinkClip);
    blinkAction.play();
  }, [mixer, idleClips, morphTargetDictionaryBody]);

  useEffect(() => {
    if (!playing || !blendData || blendData.length === 0 || !morphTargetDictionaryBody || !morphTargetDictionaryLowerTeeth) {
      return;
    }

    const clips = [
      createAnimation(blendData, morphTargetDictionaryBody, 'HG_Body'),
      createAnimation(blendData, morphTargetDictionaryLowerTeeth, 'HG_TeethLower')
    ].filter(clip => clip !== null);

    if (clips.length === 0) {
      console.error("No valid animation clips created from blendData.");
      return;
    }

    mixer.stopAllAction();

    let idleClipAction = mixer.clipAction(idleClips[0]);
    idleClipAction.play();
    let blinkClip = createAnimation(blinkData, morphTargetDictionaryBody, 'HG_Body');
    if (blinkClip) {
      let blinkAction = mixer.clipAction(blinkClip);
      blinkAction.play();
    }

    clips.forEach(clip => {
      let clipAction = mixer.clipAction(clip);
      clipAction.setLoop(THREE.LoopOnce);
      clipAction.clampWhenFinished = true;
      clipAction.play();
    });
  }, [playing, blendData, mixer, morphTargetDictionaryBody, morphTargetDictionaryLowerTeeth, idleClips]);

  useFrame((state, delta) => {
    mixer.update(delta);
  });

  return (
    <group name="avatar">
      <primitive object={gltf.scene} dispose={null} />
    </group>
  );
}

// Modifica la funzione makeSpeech per accettare testo, durata e mode
function makeSpeech(text, duration, mode) {
  // Invia testo, durata e mode al backend
  return axios.post(host + '/talk', { text, duration, mode });
}

const STYLES = {
  area: { position: 'absolute', bottom: '0', left: '0', zIndex: 500 },
  speak: { padding: '5px', display: 'block', color: '#FFFFFF', background: '#222222', border: 'None' },
  label: { color: '#777777', fontSize: '0.5em' },
}

function App() {

  const [chats, setChats] = useState([{ msg: 'Hi there! How can I assist you today?', who: 'bot', exct: '0' }])
  const [text, setText] = useState("Hello I am joi, your 3D virtual assistant.");
  const [msg, setMsg] = useState("");
  const [exct, setexct] = useState("");
  const [load, setLoad] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [visits, setVisits] = useState("--");

  const audioPlayer = useRef();

  const [speak, setSpeak] = useState(false);
  const [audioSource, setAudioSource] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [blendData, setBlendData] = useState([]);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isDemoPlaying, setIsDemoPlaying] = useState(false);
  const [generationMode, setGenerationMode] = useState('python'); // Add state for generation mode

  const getResposnse = async (userInput) => {
    if (!userInput.trim()) return;

    const startTime = Date.now();
    setLoad(true);
    setSpeak(false);
    setPlaying(false);
    setBlendData([]);
    if (audioSource && audioSource.startsWith('blob:')) {
      URL.revokeObjectURL(audioSource);
      setAudioSource(null);
    }
    setAudioDuration(0);

    setChats(chats => [...chats, { msg: userInput, who: 'me' }]);
    setMsg("");

    let audioUrl = null;
    try {
      const brainywareUrl = 'https://dev.brainyware.ai/bw-avatar/tts-dev';
      const formData = new FormData();
      formData.append('text', userInput);
      formData.append('language', 'it');
      formData.append('voice', 'male_it.wav');

      const brainywareResponse = await fetch(brainywareUrl, {
        method: 'POST',
        body: formData,
      });

      if (!brainywareResponse.ok) {
        throw new Error(`Brainyware API error: ${brainywareResponse.status} ${brainywareResponse.statusText}`);
      }

      const brainywareData = await brainywareResponse.json();

      const responseText = brainywareData.text;
      const audioBase64 = brainywareData.audio;
      const audioFormat = brainywareData.audio_format || 'wav';

      console.log("[getResposnse] Received from Brainyware - audio_format:", audioFormat);

      if (!responseText || !audioBase64) {
        throw new Error("Incomplete response from Brainyware API (missing text or audio)");
      }

      const audioMimeType = audioFormat.toLowerCase().includes('mp3') ? 'audio/mpeg' : 'audio/wav';
      console.log("[getResposnse] Determined audioMimeType:", audioMimeType);

      const audioBytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
      const audioBlob = new Blob([audioBytes], { type: audioMimeType });
      audioUrl = URL.createObjectURL(audioBlob);

      const tempAudio = document.createElement('audio');
      tempAudio.src = audioUrl;
      tempAudio.preload = 'metadata';

      const durationPromise = new Promise((resolve, reject) => {
        tempAudio.onloadedmetadata = () => {
          resolve(tempAudio.duration);
        };
        tempAudio.onerror = (e) => {
          console.error("Error loading audio metadata:", e);
          reject(new Error("Could not determine audio duration"));
        };
        setTimeout(() => reject(new Error("Timeout getting audio duration")), 5000);
      });

      let calculatedDuration = 0;
      try {
        calculatedDuration = await durationPromise;
        setAudioDuration(calculatedDuration);
        console.log("Audio duration:", calculatedDuration);
      } catch (durationError) {
        console.error(durationError);
        toast.error("Could not get audio duration. Using estimated duration.");
        calculatedDuration = Math.max(1, (responseText.length / 100) * 5);
        setAudioDuration(calculatedDuration);
      }

      console.log(`Sending to backend: text="${responseText}", duration=${calculatedDuration}, mode=${generationMode}`);
      const visemeResult = await makeSpeech(responseText, calculatedDuration, generationMode);
      const blendshapesUrl = visemeResult.data.blendshapesUrl;
      if (!blendshapesUrl) {
        throw new Error("Backend did not return a blendshapesUrl");
      }

      const blendshapesResponse = await fetch(blendshapesUrl);
      if (!blendshapesResponse.ok) {
        throw new Error(`Failed to fetch blendshapes from ${blendshapesUrl}: ${blendshapesResponse.statusText}`);
      }
      const newBlendData = await blendshapesResponse.json();

      const endTime = Date.now();
      const executionTime = ((endTime - startTime) / 1000).toFixed(1);
      setexct(executionTime);

      setText(responseText);
      setBlendData(newBlendData || []);
      console.log("Setting audioSource:", audioUrl);
      setAudioSource(audioUrl);
      audioUrl = null;
      console.log("Setting speak to true");
      setSpeak(true);

    } catch (error) {
      console.error("Error in getResponse:", error);
      toast.error(`Error processing request: ${error.message}`);
      setChats(chats => [...chats, { msg: `Sorry, I encountered an error: ${error.message}`, who: 'bot', exct: '!' }]);
      if (audioUrl && audioUrl.startsWith('blob:')) {
        console.log("Revoking object URL due to error in try block:", audioUrl);
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
      }
      if (audioSource && audioSource.startsWith('blob:')) {
        console.log("Revoking object URL from state due to error in try block:", audioSource);
        URL.revokeObjectURL(audioSource);
        setAudioSource(null);
      }
      setSpeak(false);
      setPlaying(false);
      setBlendData([]);
    } finally {
      setLoad(false);
    }
  }

  const getWebsiteVisits = async () => {
    const url = 'https://counter10.p.rapidapi.com/?ID=prompt3&COLOR=red&CLABEL=blue';
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': 'ede3c5163fmsh01abdacf07fd2b0p1c0e4bjsn1db1b15be576',
        'X-RapidAPI-Host': 'counter10.p.rapidapi.com'
      }
    };
    try {
      const response = await fetch(url, options);
      const result = await response.text();
      setVisits(JSON.parse(result).message)
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    getWebsiteVisits();
  }, [])

  useEffect(() => {
    document.querySelector('.chat-box').scrollTop = document.querySelector('.chat-box').scrollHeight;
  }, [chats])

  function playerEnded(e) {
    console.log("Audio ended. Cleaning up.");
    if (audioSource && audioSource.startsWith('blob:')) {
      console.log("Revoking object URL on end:", audioSource);
      URL.revokeObjectURL(audioSource);
    }
    setAudioSource(null);
    setSpeak(false);
    setPlaying(false);
    setBlendData([]);
  }

  function playerReady(e) {
    console.log("Audio player ready (onCanPlay). Attempting to play.");
    if (audioPlayer.current && audioPlayer.current.audioEl && audioPlayer.current.audioEl.current) {
      console.log("Audio element found. Calling play().");
      audioPlayer.current.audioEl.current.play()
        .then(() => {
          console.log("Playback started successfully.");
          setPlaying(true);
          setChats(chats => [...chats, { msg: text, who: 'bot', exct: exct }]);
        })
        .catch(error => {
          console.error("Error starting playback:", error);
          toast.error(`Could not play audio: ${error.message}`);
          if (audioSource && audioSource.startsWith('blob:')) {
            console.log("Revoking object URL due to playback error:", audioSource);
            URL.revokeObjectURL(audioSource);
          }
          setAudioSource(null);
          setSpeak(false);
          setPlaying(false);
          setBlendData([]);
        });
    } else {
      console.error("playerReady called but audio element ref is not available.");
      toast.error("Audio player reference not found.");
    }
  }

  const {
    transcript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  const startListening = () => {
    if (browserSupportsSpeechRecognition) {
      SpeechRecognition.startListening()
    }
    else {
      toast.error("Voice recognition not supported by browser.")
    }
  };

  const stopListening = () => {
    getResposnse(msg);
    SpeechRecognition.stopListening();
  }

  useEffect(() => {
    setMsg(transcript);
  }, [transcript])

  const playAzureDemo = useCallback(async () => {
    if (isDemoPlaying || playing) return;
    setIsDemoPlaying(true);
    console.log("Playing Azure Demo Animation...");
    try {
      const response = await fetch('/blendshapes-azure-demo.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const demoBlendData = await response.json();
      console.log("Azure Demo data loaded, playing...");
      setBlendData(demoBlendData);
      setPlaying(true);
    } catch (error) {
      console.error("Error loading or playing Azure demo:", error);
      alert("Failed to load or play Azure demo data. Check console.");
    } finally {
      setTimeout(() => setIsDemoPlaying(false), 3000);
    }
  }, [isDemoPlaying, playing]);

  return (
    <div className="full">
      <ToastContainer
        position="top-left"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      <div style={STYLES.area}>
        <button style={STYLES.speak}>
          {speak || load ? 'Running...' : 'Type message.'}
        </button>
      </div>
      <div className='about' onClick={() => { setShowModal(!showModal) }}>
        <img src='./images/icons/menu.png' alt='menu'></img>
      </div>
      <div className='modal' style={{ display: showModal ? 'flex' : 'none' }}>
        
        <div className="mode-selection">
          <h3>Generation Mode:</h3>
          <label>
            <input
              type="radio"
              name="generationMode"
              value="python"
              checked={generationMode === 'python'}
              onChange={(e) => setGenerationMode(e.target.value)}
              disabled={playing || load || isDemoPlaying}
            />
            Python (Coqui TTS + Espeak Phonemes)
          </label>
          <br />
          <label>
            <input
              type="radio"
              name="generationMode"
              value="espeak"
              checked={generationMode === 'espeak'}
              onChange={(e) => setGenerationMode(e.target.value)}
              disabled={playing || load || isDemoPlaying}
            />
            Espeak Direct (Phonemes + Timing/Estimate)
          </label>
        </div>
      </div>
      <div className='chat-div'>
        <div className='chat-box'>
          {chats.map((chat, index) => {
            return (
              <div key={`${chat.who}-${index}`} className={`chat-message ${chat.who}`}>
                {chat.msg}
                {chat.who === 'bot' && chat.exct !== '!' && chat.exct !== '0' && (
                  <div className='time'>{"generated in " + chat.exct + "s"}</div>
                )}
              </div>
            );
          })}

          {(load == true || (speak && !playing)) ? <p style={{ padding: '5px', display: 'flex', alignItems: 'center' }}><lottie-player src="https://lottie.host/8891318b-7fd9-471d-a9f4-e1358fd65cd6/EQt3MHyLWk.json" style={{ width: "50px", height: "50px" }} loop autoplay speed="1.4" direction="1" mode="normal"></lottie-player></p> : <></>}
        </div>
        <div className='msg-box'>
          <button className='msgbtn' id='mic' onTouchStart={startListening} onMouseDown={startListening} onTouchEnd={stopListening} onMouseUp={stopListening} disabled={load || speak}>
            <img src='./images/icons/mic.png' alt='mic' unselectable='on'></img>
          </button>
          <input type='text' value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { getResposnse(msg) } }} placeholder='Say Hello!' disabled={load || speak}></input>
          <button className='msgbtn' id='send' onClick={() => { getResposnse(msg) }} disabled={load || speak}>
            <img src='./images/icons/send.png' alt='send'></img>
          </button>
          <button className='msgbtn' id='demo' onClick={playAzureDemo} disabled={load || speak || isDemoPlaying}>
            {isDemoPlaying ? 'Playing Demo...' : 'Play Azure Demo'}
          </button>
        </div>
      </div>
      {speak && audioSource && (
        <ReactAudioPlayer
          ref={audioPlayer}
          src={audioSource}
          onEnded={playerEnded}
          onCanPlay={playerReady}
          onError={(e) => {
            console.error("ReactAudioPlayer Error:", e);
            const audioError = audioPlayer.current?.audioEl?.current?.error;
            let errorMsg = "Audio player encountered an error.";
            if (audioError) {
              errorMsg += ` Code: ${audioError.code}, Message: ${audioError.message}`;
            }
            toast.error(errorMsg);
            if (audioSource && audioSource.startsWith('blob:')) {
              console.log("Revoking object URL due to player error:", audioSource);
              URL.revokeObjectURL(audioSource);
            }
            setAudioSource(null);
            setSpeak(false);
            setPlaying(false);
            setBlendData([]);
          }}
        />
      )}
      <Canvas dpr={2} onCreated={(ctx) => {
        ctx.gl.physicallyCorrectLights = true;
      }}>
        <OrthographicCamera
          makeDefault
          zoom={1400}
          position={[0, 1.65, 1]}
        />

        <Suspense fallback={null}>
          <Environment background={false} files="/images/photo_studio_loft_hall_1k.hdr" />
        </Suspense>

        <Suspense fallback={null}>
          <Bg />
        </Suspense>

        <Suspense fallback={null}>
          <Avatar
            avatar_url="/model.glb"
            blendData={blendData}
            playing={playing}
            setLoad={setLoad}
          />
        </Suspense>
      </Canvas>
      <Loader dataInterpolation={(p) => `Loading... please wait`} />
    </div>
  )
}

function Bg() {
  const texture = useTexture('/images/background.jpg');

  return (
    <mesh position={[0, 1.5, -4]} scale={[1.2, 1.2, 1.2]}>
      <planeGeometry />
      <meshBasicMaterial map={texture} />
    </mesh>
  )
}

export default App;
