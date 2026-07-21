import React from "react";
import styled, { createGlobalStyle } from "styled-components";
import { message } from "antd";
import CloseIcon from "../assets/CloseIcon";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { useSearchParams } from "react-router-dom";
import MicIcon from "assets/MicIcon";
import PauseIcon from "assets/PauseIcon";
import { DEFAULT_SOURCE_LANGUAGE } from "utils/constants";

const GlobalStyle = createGlobalStyle`
  @keyframes pulse {
    0% { transform: scale(0.95); opacity: 0.7; }
    70% { transform: scale(1.1); opacity: 0.3; }
    100% { transform: scale(0.95); opacity: 0.7; }
  }
`;

const Container = styled.div<{ $hasText: boolean }>`
  position: relative;
  height: auto;
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 400;
  line-height: 1.4;
  max-height: 100vh;

  textarea {
    width: 100%;
    height: 87%;
    background-color: #ffffff;
    border: none;
    outline: none;
    box-shadow: none;
    color: #111111;
    font-family: inherit;
    font-weight: 400;
    letter-spacing: 0.2px;
    padding: 16px 40px 24px 16px;
    font-size: 18px;
    resize: none;
    transition: all 0.1s ease;
    

    &:focus {
      outline: none;
      box-shadow: none;
    }

    &::-webkit-scrollbar {
      width: 12px;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 20px;
      background-color: #e0e0e0;
    }
  }

  .text-clear {
    display: ${(props) => (props.$hasText ? "block" : "none")};
    position: absolute;
    top: 16px;
    right: 16px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: opacity 0.2s ease;
    color: #333333;

    &:hover {
      opacity: 0.8;
    }
  }
`;

const Actions = styled.div`
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 16px;

  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 5px;
    transition: all 0.2s ease;
    position: relative;
    color: #111111;
    
    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    &:hover:not(:disabled) {
      transform: scale(1.05);
    }
  }

  .error-message {
    color: #ff4444;
    font-size: 12px;
    margin-left: 10px;
    animation: fadeIn 0.2s ease;

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  }

  .pulse-indicator {
    position: absolute;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2px solid rgba(0,0,0,0.06);
    animation: pulse 1s infinite;
  }
`;

const TranslationTextField = () => {
  const [searchParams, setURLSearchParams] = useSearchParams();
  const [text, setText] = React.useState(searchParams.get("text") || "");
  const urlTextParam = searchParams.get("text") || "";
  const sl = searchParams.get("sl") || DEFAULT_SOURCE_LANGUAGE;
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<string | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const vadIntervalRef = React.useRef<number | null>(null);
  const silenceTimerRef = React.useRef<number | null>(null);
  const activeFramesRef = React.useRef<number>(0);
  const silentFramesRef = React.useRef<number>(0);
  const rmsSmoothRef = React.useRef<number>(0);
  const noiseFloorRef = React.useRef<number>(1);
  const floatDataRef = React.useRef<Float32Array | null>(null);
  const byteDataRef = React.useRef<Uint8Array | null>(null);
  const fftDataRef = React.useRef<Uint8Array | null>(null);
  const fftSizeRef = React.useRef<number>(0);
  const currentAnalyserRef = React.useRef<AnalyserNode | null>(null);
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition({
    clearTranscriptOnListen: false,
    commands: [
      {
        command: 'clear',
        callback: () => clearTextHandler(),
      }
    ]
  });
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const manualEditRef = React.useRef<boolean>(false);
  const manualEditTimeoutRef = React.useRef<number | null>(null);
  const [keepMicOn, setKeepMicOn] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem("keepMicOn") === "true";
    } catch (e) {
      return false;
    }
  });
  const keepMicOnRef = React.useRef<boolean>(keepMicOn);

  // VAD (Voice Activity Detection) settings - OPTIMIZED FOR VOICE IN MUSIC & NOISE REJECTION
  // Detección: voces en canciones, susurros, gritos | Ignora: viento, respiración, ruido blanco
  const baseVolumeThreshold = 0.01; // umbral bajo para detectar voces rápidamente
  const vadCheckInterval = 25; // ms entre comprobaciones de VAD (detección más rápida)
  const activeHoldCount = 1; // frames consecutivos para activación más rápida
  const silenceHoldCount = 2; // frames consecutivos para detección de silencio más rápida
  const silenceTimeout = 800; // ms de silencio adicional (más rápido)
  const rmsSmoothingAlpha = 0.30; // coeficiente EMA mejorado para respuesta más rápida
  const adaptiveMultiplier = 2.0; // umbral adaptativo más sensible
  const peakVoiceThreshold = 0.45; // umbral directo más bajo para detectar voces
  const spectralCentroidThreshold = 1200; // Hz - rango reducido para detección más rápida
  const formantRatioThreshold = 0.30; // ratio más bajo para mejor sensibilidad
  const spectralFlatnessThreshold = 0.45; // umbral relajado para mayor sensibilidad
  const zeroCrossingThreshold = 0.18; // umbral relajado para mejor respuesta
  const windNoiseThreshold = 35; // energía baja en medios/altos = viento/respiración

  // Límite máximo de caracteres para el transcript acumulado (previene memory leak)
  const MAX_TRANSCRIPT_LENGTH = 10000;
  
  // Límite máximo para URL params (los navegadores tienen límites en la longitud de URLs)
  const MAX_URL_TEXT_LENGTH = 8000;

  // Solicitar permiso y listar dispositivos al inicio
  React.useEffect(() => {
    const initDevices = async () => {
      try {
        // If a device was already selected, skip re-requesting permissions
        if (selectedDeviceId) return;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        const list = await navigator.mediaDevices.enumerateDevices();
        const inputs = list.filter(d => d.kind === 'audioinput');
        if (inputs.length > 0 && !selectedDeviceId) setSelectedDeviceId(inputs[0].deviceId);
      } catch (err) {
        console.warn('No se pudo acceder a dispositivos de audio', err);
      }
    };

    initDevices();
  }, [selectedDeviceId]);

  const setTextParam = React.useCallback((value: string) => {
    const trimmedValue = value.trim() === "" ? "" : value;
    setText(trimmedValue);
    
    // Truncar texto para URL (previene problemas con URLs muy largas)
    const truncatedValue = trimmedValue.length > MAX_URL_TEXT_LENGTH
      ? trimmedValue.slice(0, MAX_URL_TEXT_LENGTH)
      : trimmedValue;
    
    setURLSearchParams((params) => {
      if (truncatedValue === "") {
        params.delete("text");
      } else {
        params.set("text", truncatedValue);
      }
      return params;
    });
  }, [setURLSearchParams, MAX_URL_TEXT_LENGTH]);

  // Sync local `text` state when the URL `text` param changes externally
  // (for example, when the user swaps languages and another component
  // writes the translated text into the `text` param).
  React.useEffect(() => {
    if (manualEditRef.current) return; // don't override user's manual edits
    if (urlTextParam !== text) {
      setText(urlTextParam);
    }
  }, [urlTextParam, text]);

  const clearTextHandler = async () => {
    setTextParam("");
    resetTranscript();
    if (listening) {
      await SpeechRecognition.stopListening();
      SpeechRecognition.abortListening(); // Forzar el cese inmediato de la escucha
    }
    // Solo limpiar recursos si el usuario NO quiere mantener el micrófono encendido
    if (!keepMicOnRef.current) await cleanupAudioProcessing();
  };

  const handleChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Marcar edición manual para evitar que la VAD/transcripción la sobrescriba inmediatamente
    if (manualEditTimeoutRef.current) {
      window.clearTimeout(manualEditTimeoutRef.current);
      manualEditTimeoutRef.current = null;
    }
    manualEditRef.current = true;
    manualEditTimeoutRef.current = window.setTimeout(() => {
      manualEditRef.current = false;
      manualEditTimeoutRef.current = null;
    }, 700);

    setTextParam(e.target.value);

    // Si el usuario borró todo el texto, también limpiar la transcripción
    if (e.target.value.trim() === "") {
      resetTranscript();
    }
  };

  // Optimized speech recognition handling
  const handleSpeech = async () => {
    try {
      setIsProcessing(true);
      if (listening) {
        await SpeechRecognition.stopListening();
        if (!keepMicOnRef.current) await cleanupAudioProcessing();
      } else {
        if (!keepMicOnRef.current) {
          message.warning("Debes activar el micrófono");
          return;
        }
        if (isMicrophoneAvailable === false) {
          alert("Por favor permite acceso al micrófono");
          return;
        }
        // Inicializar procesamiento de audio con constraints y VAD
        await setupAudioProcessing(selectedDeviceId);

        await SpeechRecognition.startListening({
          continuous: true,
          interimResults: true,
          language: sl
        });
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const cleanupAudioProcessing = React.useCallback(async () => {
    try {
      // Si el usuario quiere mantener el micrófono encendido, no cerramos los recursos
      const shouldClose = !keepMicOnRef.current;

      if (shouldClose) {
        if (vadIntervalRef.current) {
          window.clearInterval(vadIntervalRef.current);
          vadIntervalRef.current = null;
        }

        // Limpiar timeout de silencio
        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        // Reset VAD counters
        activeFramesRef.current = 0;
        silentFramesRef.current = 0;
        
        // Limpiar refs de buffers (previene memory leak)
        floatDataRef.current = null;
        byteDataRef.current = null;
        fftDataRef.current = null;
        fftSizeRef.current = 0;
        currentAnalyserRef.current = null;
        analyserRef.current = null;
      }

      if (mediaStreamRef.current) {
        if (shouldClose) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
      }

      if (audioContextRef.current) {
        if (shouldClose) {
          try { await audioContextRef.current.close(); } catch(e){}
          audioContextRef.current = null;
        }
      }
    } catch (err) {
      console.warn('Error during cleanupAudioProcessing', err);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setupAudioProcessing = React.useCallback(async (deviceId: string | null) => {
    // Guardar refs viejas antes de tocarlas
    const oldAudioCtx = audioContextRef.current;
    const oldStream = mediaStreamRef.current;
    const shouldClose = !keepMicOnRef.current;

    // PASO 1: Crear el AudioContext NUEVO ANTES de cualquier await (crítico para móviles)
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    audioContextRef.current = audioCtx;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    try {
      // PASO 2: Limpiar recursos VIEJOS (VAD, stream, AudioContext anterior)
      if (shouldClose) {
        if (vadIntervalRef.current) {
          window.clearInterval(vadIntervalRef.current);
          vadIntervalRef.current = null;
        }
        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        activeFramesRef.current = 0;
        silentFramesRef.current = 0;
        floatDataRef.current = null;
        byteDataRef.current = null;
        fftDataRef.current = null;
        fftSizeRef.current = 0;
        currentAnalyserRef.current = null;
        analyserRef.current = null;
      }

      if (oldStream && shouldClose) {
        oldStream.getTracks().forEach(t => t.stop());
      }
      mediaStreamRef.current = null;

      if (oldAudioCtx && shouldClose) {
        try { await oldAudioCtx.close(); } catch(e) {}
      }

      // PASO 3: Obtener nuevo stream de micrófono
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      // PASO 4: Construir pipeline con el AudioContext creado en el paso 1
      const source = audioCtx.createMediaStreamSource(stream);
      const compressor = audioCtx.createDynamicsCompressor();
      const gain = audioCtx.createGain();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;

      source.connect(compressor);
      compressor.connect(gain);
      gain.connect(analyser);

      analyserRef.current = analyser;

      startVAD();
    } catch (err) {
      console.error('No se pudo inicializar audio:', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Asegura que la captura de audio esté activa (sin iniciar el reconocimiento)
  const ensureAudioStreamActive = React.useCallback(async () => {
    try {
      if (!mediaStreamRef.current) {
        await setupAudioProcessing(selectedDeviceId);
      }
    } catch (e) {
      console.warn('No se pudo activar captura de audio:', e);
    }
  }, [selectedDeviceId, setupAudioProcessing]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const startVAD = React.useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    currentAnalyserRef.current = analyser;

    // Crear buffers UNA SOLA VEZ y reutilizarlos (previene memory leak)
    if (!floatDataRef.current || fftSizeRef.current !== analyser.fftSize) {
      floatDataRef.current = new Float32Array(analyser.fftSize);
      byteDataRef.current = new Uint8Array(analyser.fftSize);
      fftDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      fftSizeRef.current = analyser.fftSize;
    }

    const floatData = floatDataRef.current;
    const byteData = byteDataRef.current;
    const fftData = fftDataRef.current;

    // Comprobar nivel RMS en intervalos regulares con análisis espectral para voces en música
    vadIntervalRef.current = window.setInterval(() => {
      const analyser = currentAnalyserRef.current;
      if (!analyser || !floatData || !byteData || !fftData) return;

      // Usar getByteTimeDomainData (más rápido que getFloatTimeDomainData)
      analyser.getByteTimeDomainData(byteData);
      for (let i = 0; i < byteData.length; i++) {
        floatData[i] = (byteData[i] - 128) / 128;
      }

      // Análisis FFT para detección de espectro (voces vs música/ruido)
      analyser.getByteFrequencyData(fftData);

      // Calcular energía en rangos de frecuencia específicos para voz humana
      const nyquist = analyser.context.sampleRate / 2;
      const binWidth = nyquist / fftData.length;
      
      // Rango bajo (60-250Hz) - fundamentales de voz
      const lowBinStart = Math.floor(60 / binWidth);
      const lowBinEnd = Math.floor(250 / binWidth);
      let lowEnergy = 0;
      for (let i = lowBinStart; i < lowBinEnd; i++) {
        lowEnergy += fftData[i];
      }
      lowEnergy /= (lowBinEnd - lowBinStart + 1);

      // Rango medio (250-2000Hz) - formantes principales de voz
      const midBinStart = lowBinEnd;
      const midBinEnd = Math.floor(2000 / binWidth);
      let midEnergy = 0;
      for (let i = midBinStart; i < midBinEnd; i++) {
        midEnergy += fftData[i];
      }
      midEnergy /= (midBinEnd - midBinStart + 1);

      // Rango alto (2000-4000Hz) - armónicos de voz
      const highBinStart = midBinEnd;
      const highBinEnd = Math.floor(4000 / binWidth);
      let highEnergy = 0;
      for (let i = highBinStart; i < highBinEnd; i++) {
        highEnergy += fftData[i];
      }
      highEnergy /= (highBinEnd - highBinStart + 1);

      // Calcular ratios espectrales característicos de voz
      const formantRatio = (midEnergy + highEnergy) / (lowEnergy + midEnergy + 0.001);
      const voiceSignature = midEnergy > lowEnergy * 0.7; // Voces tienen más energía media que baja

      // Calcular centroide espectral y flatness en un solo pass
      let numerator = 0;
      let denominator = 0;
      let geometricProduct = 1;
      for (let i = highBinStart; i < highBinEnd; i++) { // Solo en rango de voz
        const frequency = (i * nyquist) / fftData.length;
        numerator += frequency * fftData[i];
        denominator += fftData[i];
        if (fftData[i] > 0) geometricProduct *= Math.pow(fftData[i], 1 / (highBinEnd - highBinStart + 1));
      }
      const spectralCentroid = denominator > 0 ? numerator / denominator : 0;
      const isSpectralInVoiceRange = spectralCentroid > spectralCentroidThreshold * 0.6; // 900Hz mínimo

      // Calcular spectral flatness (Wiener entropy) - rechaza viento y ruido plano
      // Voces: < 0.4 (con formantes) | Viento/Ruido: > 0.6 (espectro plano)
      const arithmeticMean = denominator / (highBinEnd - highBinStart + 1) || 1e-10;
      const spectralFlatness = Math.max(0, Math.min(1, geometricProduct / (arithmeticMean + 1e-10)));
      const isNotWindNoise = spectralFlatness < spectralFlatnessThreshold; // rechaza espectro plano

      // Calcular Zero Crossing Rate (ZCR) - detecta ruido vs voz estructurada
      // Ruido: ZCR alto | Voz: ZCR bajo y consistente
      let zeroCrossings = 0;
      for (let i = 1; i < floatData.length; i++) {
        if ((floatData[i] > 0 && floatData[i - 1] <= 0) || (floatData[i] <= 0 && floatData[i - 1] > 0)) {
          zeroCrossings++;
        }
      }
      const zcr = zeroCrossings / floatData.length;
      const isNotVoiceNoise = zcr < zeroCrossingThreshold; // rechaza ruido aleatorio (respiración)

      // Detectar viento/respiración: energía muy baja en rangos de voz
      const voiceEnergyRatio = (midEnergy + highEnergy) / (lowEnergy + 1e-6);
      const isNotWindRespiration = voiceEnergyRatio > windNoiseThreshold * 0.01; // energía en rangos de voz

      let sum = 0;
      for (let i = 0; i < floatData.length; i++) {
        const v = floatData[i];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / floatData.length);

      // Suavizado exponencial del RMS para evitar picos
      const prevSmooth = rmsSmoothRef.current || 0;
      const smooth = rmsSmoothingAlpha * rms + (1 - rmsSmoothingAlpha) * prevSmooth;
      rmsSmoothRef.current = smooth;

      // Mantener estimación del ruido de fondo (mínimo adaptativo con ligero decaimiento hacia arriba)
      noiseFloorRef.current = Math.min(noiseFloorRef.current, smooth * 0.8);
      // Decaimiento rápido hacia arriba para permitir mejor adaptación al ruido cambiante
      noiseFloorRef.current = Math.max(noiseFloorRef.current, noiseFloorRef.current * 1.001);

      const adaptiveThreshold = Math.max(baseVolumeThreshold, noiseFloorRef.current * adaptiveMultiplier + 0.003);

      // Detección mejorada con rechazo de ruidos ambientales:
      // Energía + firma espectral + centroide + flatness + ZCR + relación energía
      // Ignora: instrumentales | viento | respiración | ruido blanco | plosivas
      const isVoiceDetected = 
        (smooth > adaptiveThreshold || rms > peakVoiceThreshold) &&
        (voiceSignature || formantRatio > formantRatioThreshold) &&
        isSpectralInVoiceRange &&
        isNotWindNoise &&
        isNotVoiceNoise &&
        isNotWindRespiration;

      // Mantener conteo de frames activos/silenciosos para evitar disparos por transitorios
      if (isVoiceDetected) {
        activeFramesRef.current += 1;
        silentFramesRef.current = 0;

        // Limpiar timeout de silencio si hay actividad
        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        if (activeFramesRef.current >= activeHoldCount) {
          // Nota: no iniciamos la grabación automáticamente por VAD.
          // La app solo debe grabar cuando el usuario pulse el icono del micrófono.
        }
      } else {
        silentFramesRef.current += 1;
        activeFramesRef.current = 0;

        if (silentFramesRef.current >= silenceHoldCount) {
            // Iniciar timeout de silencio adicional para confirmación de pausa extendida
            if (!silenceTimerRef.current && listening) {
              silenceTimerRef.current = window.setTimeout(() => {
                // Si el usuario activó "keepMicOn", no detener la escucha automáticamente
                if (listening && !keepMicOnRef.current) {
                  SpeechRecognition.stopListening().catch(()=>{});
                }
                silenceTimerRef.current = null;
              }, silenceTimeout);
            }
          }
      }
    }, vadCheckInterval);
  }, [listening, vadCheckInterval, baseVolumeThreshold, adaptiveMultiplier, peakVoiceThreshold, formantRatioThreshold, spectralCentroidThreshold, spectralFlatnessThreshold, zeroCrossingThreshold, windNoiseThreshold, silenceTimeout, activeHoldCount, silenceHoldCount, rmsSmoothingAlpha]);

  const previousTranscriptRef = React.useRef("");

  const addPunctuation = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed || /[.!?…]$/.test(trimmed)) return trimmed;
    const questionWords = /^(what|who|where|when|why|how|which|do|does|did|is|are|was|were|can|could|will|would|shall|should|may|might|am|has|have|had|que|qué|quien|quién|donde|dónde|cuando|cuándo|como|cómo|por qué|porque|cuál|cual|cuáles|cuales)$/i;
    const firstWord = trimmed.split(/\s+/)[0];
    if (questionWords.test(firstWord)) return trimmed + '?';
    return trimmed + '.';
  };
  
  React.useEffect(() => {
    if (!listening) return;
    if (manualEditRef.current) return;

    if (transcript && transcript !== previousTranscriptRef.current) {
      previousTranscriptRef.current = transcript;
      
      const punctuated = addPunctuation(transcript);
      const truncated = punctuated.length > MAX_URL_TEXT_LENGTH
        ? punctuated.slice(-MAX_URL_TEXT_LENGTH)
        : punctuated;
      
      requestAnimationFrame(() => {
        setTextParam(truncated);
      });
    }
  }, [transcript, setTextParam, listening, MAX_URL_TEXT_LENGTH]);

  React.useEffect(() => {
    if (textareaRef.current && !listening) {
      textareaRef.current.focus();
    }
  }, [listening]);

  // Mantener referencia y persistencia para el toggle keepMicOn
  React.useEffect(() => {
    keepMicOnRef.current = keepMicOn;
    try {
      localStorage.setItem("keepMicOn", keepMicOn ? "true" : "false");
    } catch (e) {}

    // Si se activa el toggle, mantener la captura activa (no necesariamente iniciar reconocimiento)
    if (keepMicOn) {
      if (browserSupportsSpeechRecognition && isMicrophoneAvailable) {
        ensureAudioStreamActive();
      }
    } else {
      // Si se desactiva, detener la escucha y forzar el cierre de recursos
      if (listening) {
        SpeechRecognition.stopListening().catch(()=>{});
      }
      cleanupAudioProcessing();
    }
  }, [keepMicOn, browserSupportsSpeechRecognition, isMicrophoneAvailable, ensureAudioStreamActive, listening, cleanupAudioProcessing]);

  return (
    <Container $hasText={!!text}>
      <GlobalStyle />
      <div style={{ height: "100%" }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChangeText}
          placeholder="Start typing.."
          aria-label="Texto para traducción"
          autoFocus
          spellCheck={false}
          maxLength={MAX_URL_TEXT_LENGTH}
        ></textarea>
        {text && (
          <button className="text-clear" onClick={clearTextHandler} aria-label="Limpiar texto">
            <CloseIcon />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11, color: '#999' }}>
          {text.length.toLocaleString()} / {MAX_URL_TEXT_LENGTH.toLocaleString()}
        </span>
        
        
        <button onClick={async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
          } catch (err) { console.warn(err); }
        }} style={{ background: 'none', border: 'none', color: '#333', cursor: 'pointer' }} aria-label="Refrescar dispositivos">↻</button>
      </div>
      <Actions>
        {browserSupportsSpeechRecognition ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                role="switch"
                aria-checked={keepMicOn}
                aria-label="Toggle keep microphone on"
                onClick={() => setKeepMicOn(prev => !prev)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setKeepMicOn(prev => !prev); } }}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: keepMicOn ? '#4caf50' : '#000000',
                  border: 'none',
                  position: 'relative',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <span style={{
                  position: 'absolute',
                  top: 2,
                  left: keepMicOn ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.15s',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                }} />
              </button>
              <span style={{ color: '#333', fontSize: 12 }}>Keep microphone on</span>
            </div>
            <button 
              onMouseDown={() => { if (!mediaStreamRef.current && keepMicOn) ensureAudioStreamActive(); }}
              onTouchStart={() => { if (!mediaStreamRef.current && keepMicOn) ensureAudioStreamActive(); }}
              onClick={handleSpeech}
              disabled={isProcessing}
              aria-label={listening ? "Detener reconocimiento" : "Iniciar reconocimiento"}
            >
              {listening ? <PauseIcon /> : <MicIcon />}
            </button>
          </>
        ) : (
          <p>Reconocimiento de voz no soportado</p>
        )}
        {!isMicrophoneAvailable && browserSupportsSpeechRecognition && (
          <div className="error-message">
            Micrófono no detectado
          </div>
        )}
      </Actions>
    </Container>
  );
};

export default TranslationTextField;