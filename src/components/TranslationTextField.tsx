import React from "react";
import { message } from "antd";
import CloseIcon from "../assets/CloseIcon";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import { useSearchParams } from "react-router-dom";
import MicIcon from "assets/MicIcon";
import PauseIcon from "assets/PauseIcon";
import { DEFAULT_SOURCE_LANGUAGE } from "utils/constants";

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
  const PLACEHOLDER_MESSAGES = React.useMemo(() => ["Start typing..", "Or use voice mode"], []);
  const [placeholder, setPlaceholder] = React.useState("");

  React.useEffect(() => {
    if (text) return;
    let timer: number | null = null;
    let msgIndex = 0;
    let charIndex = 0;

    const typeNext = () => {
      const currentMsg = PLACEHOLDER_MESSAGES[msgIndex];
      charIndex++;
      if (charIndex > currentMsg.length) {
        timer = window.setTimeout(() => {
          setPlaceholder("");
          charIndex = 0;
          msgIndex = (msgIndex + 1) % PLACEHOLDER_MESSAGES.length;
          typeNext();
        }, 3000);
        return;
      }
      setPlaceholder(currentMsg.slice(0, charIndex));
      timer = window.setTimeout(typeNext, 80);
    };
    typeNext();
    return () => { if (timer !== null) window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text ? 'filled' : 'empty']);

  // VAD (Voice Activity Detection) settings - OPTIMIZED FOR VOICE IN MUSIC & NOISE REJECTION
  // Detección: voces en canciones, susurros, gritos | Ignora: viento, respiración, ruido blanco
  const baseVolumeThreshold = 0.01;
  const vadCheckInterval = 25;
  const activeHoldCount = 1;
  const silenceHoldCount = 2;
  const silenceTimeout = 800;
  const rmsSmoothingAlpha = 0.30;
  const adaptiveMultiplier = 2.0;
  const peakVoiceThreshold = 0.45;
  const spectralCentroidThreshold = 1200;
  const formantRatioThreshold = 0.30;
  const spectralFlatnessThreshold = 0.45;
  const zeroCrossingThreshold = 0.18;
  const windNoiseThreshold = 35;

  const MAX_URL_TEXT_LENGTH = 8000;

  React.useEffect(() => {
    const initDevices = async () => {
      try {
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

  React.useEffect(() => {
    if (manualEditRef.current) return;
    if (urlTextParam !== text) {
      setText(urlTextParam);
    }
  }, [urlTextParam, text]);

  const clearTextHandler = async () => {
    setTextParam("");
    resetTranscript();
    previousTranscriptRef.current = "";
    if (listening) {
      await SpeechRecognition.stopListening();
      SpeechRecognition.abortListening();
    }
    await cleanupAudioProcessing();
  };

  const handleChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

    if (e.target.value.trim() === "") {
      resetTranscript();
    }
  };

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
      const shouldClose = !keepMicOnRef.current;

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

      if (mediaStreamRef.current) {
        if (shouldClose) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
      }

      if (audioContextRef.current) {
        if (shouldClose) {
          try { await audioContextRef.current.close(); } catch (e) { }
          audioContextRef.current = null;
        }
      }
    } catch (err) {
      console.warn('Error during cleanupAudioProcessing', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setupAudioProcessing = React.useCallback(async (deviceId: string | null) => {
    const oldAudioCtx = audioContextRef.current;
    const oldStream = mediaStreamRef.current;
    const shouldClose = !keepMicOnRef.current;

    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    audioContextRef.current = audioCtx;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    try {
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
        try { await oldAudioCtx.close(); } catch (e) { }
      }

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

  const ensureAudioStreamActive = React.useCallback(async () => {
    try {
      if (!mediaStreamRef.current) {
        await setupAudioProcessing(selectedDeviceId);
      }
    } catch (e) {
      console.warn('No se pudo activar captura de audio:', e);
    }
  }, [selectedDeviceId, setupAudioProcessing]);

  const startVAD = React.useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    currentAnalyserRef.current = analyser;

    if (!floatDataRef.current || fftSizeRef.current !== analyser.fftSize) {
      floatDataRef.current = new Float32Array(analyser.fftSize) as Float32Array;
      byteDataRef.current = new Uint8Array(analyser.fftSize) as Uint8Array;
      fftDataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array;
      fftSizeRef.current = analyser.fftSize;
    }

    const floatData = floatDataRef.current;
    const byteData = byteDataRef.current;
    const fftData = fftDataRef.current;

    vadIntervalRef.current = window.setInterval(() => {
      const analyser = currentAnalyserRef.current;
      if (!analyser || !floatData || !byteData || !fftData) return;

      analyser.getByteTimeDomainData(byteData as any);
      for (let i = 0; i < byteData.length; i++) {
        floatData[i] = (byteData[i] - 128) / 128;
      }

      analyser.getByteFrequencyData(fftData as any);

      const nyquist = analyser.context.sampleRate / 2;
      const binWidth = nyquist / fftData.length;

      const lowBinStart = Math.floor(60 / binWidth);
      const lowBinEnd = Math.floor(250 / binWidth);
      let lowEnergy = 0;
      for (let i = lowBinStart; i < lowBinEnd; i++) {
        lowEnergy += fftData[i];
      }
      lowEnergy /= (lowBinEnd - lowBinStart + 1);

      const midBinStart = lowBinEnd;
      const midBinEnd = Math.floor(2000 / binWidth);
      let midEnergy = 0;
      for (let i = midBinStart; i < midBinEnd; i++) {
        midEnergy += fftData[i];
      }
      midEnergy /= (midBinEnd - midBinStart + 1);

      const highBinStart = midBinEnd;
      const highBinEnd = Math.floor(4000 / binWidth);
      let highEnergy = 0;
      for (let i = highBinStart; i < highBinEnd; i++) {
        highEnergy += fftData[i];
      }
      highEnergy /= (highBinEnd - highBinStart + 1);

      const formantRatio = (midEnergy + highEnergy) / (lowEnergy + midEnergy + 0.001);
      const voiceSignature = midEnergy > lowEnergy * 0.7;

      let numerator = 0;
      let denominator = 0;
      let geometricProduct = 1;
      for (let i = highBinStart; i < highBinEnd; i++) {
        const frequency = (i * nyquist) / fftData.length;
        numerator += frequency * fftData[i];
        denominator += fftData[i];
        if (fftData[i] > 0) geometricProduct *= Math.pow(fftData[i], 1 / (highBinEnd - highBinStart + 1));
      }
      const spectralCentroid = denominator > 0 ? numerator / denominator : 0;
      const isSpectralInVoiceRange = spectralCentroid > spectralCentroidThreshold * 0.6;

      const arithmeticMean = denominator / (highBinEnd - highBinStart + 1) || 1e-10;
      const spectralFlatness = Math.max(0, Math.min(1, geometricProduct / (arithmeticMean + 1e-10)));
      const isNotWindNoise = spectralFlatness < spectralFlatnessThreshold;

      let zeroCrossings = 0;
      for (let i = 1; i < floatData.length; i++) {
        if ((floatData[i] > 0 && floatData[i - 1] <= 0) || (floatData[i] <= 0 && floatData[i - 1] > 0)) {
          zeroCrossings++;
        }
      }
      const zcr = zeroCrossings / floatData.length;
      const isNotVoiceNoise = zcr < zeroCrossingThreshold;

      const voiceEnergyRatio = (midEnergy + highEnergy) / (lowEnergy + 1e-6);
      const isNotWindRespiration = voiceEnergyRatio > windNoiseThreshold * 0.01;

      let sum = 0;
      for (let i = 0; i < floatData.length; i++) {
        const v = floatData[i];
        sum += v * v;
      }
      const rms = Math.sqrt(sum / floatData.length);

      const prevSmooth = rmsSmoothRef.current || 0;
      const smooth = rmsSmoothingAlpha * rms + (1 - rmsSmoothingAlpha) * prevSmooth;
      rmsSmoothRef.current = smooth;

      noiseFloorRef.current = Math.min(noiseFloorRef.current, smooth * 0.8);
      noiseFloorRef.current = Math.max(noiseFloorRef.current, noiseFloorRef.current * 1.001);

      const adaptiveThreshold = Math.max(baseVolumeThreshold, noiseFloorRef.current * adaptiveMultiplier + 0.003);

      const isVoiceDetected =
        (smooth > adaptiveThreshold || rms > peakVoiceThreshold) &&
        (voiceSignature || formantRatio > formantRatioThreshold) &&
        isSpectralInVoiceRange &&
        isNotWindNoise &&
        isNotVoiceNoise &&
        isNotWindRespiration;

      if (isVoiceDetected) {
        activeFramesRef.current += 1;
        silentFramesRef.current = 0;

        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        if (activeFramesRef.current >= activeHoldCount) {
        }
      } else {
        silentFramesRef.current += 1;
        activeFramesRef.current = 0;

        if (silentFramesRef.current >= silenceHoldCount) {
          if (!silenceTimerRef.current && listening) {
            silenceTimerRef.current = window.setTimeout(() => {
              if (listening && !keepMicOnRef.current) {
                SpeechRecognition.stopListening().catch(() => { });
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

  // Restart speech recognition when source language changes while listening
  React.useEffect(() => {
    if (listening) {
      const restartWithNewLang = async () => {
        await SpeechRecognition.stopListening();
        await SpeechRecognition.startListening({
          continuous: true,
          interimResults: true,
          language: sl
        });
      };
      restartWithNewLang().catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sl]);

  React.useEffect(() => {
    keepMicOnRef.current = keepMicOn;
    try {
      localStorage.setItem("keepMicOn", keepMicOn ? "true" : "false");
    } catch (e) { }

    if (keepMicOn) {
      if (browserSupportsSpeechRecognition && isMicrophoneAvailable) {
        ensureAudioStreamActive();
      }
    } else {
      if (listening) {
        SpeechRecognition.stopListening().catch(() => { });
      }
      cleanupAudioProcessing();
    }
  }, [keepMicOn, browserSupportsSpeechRecognition, isMicrophoneAvailable, ensureAudioStreamActive, listening, cleanupAudioProcessing]);

  return (
    <div className="relative h-auto font-sans font-normal leading-normal max-h-screen flex-1">
      <div className="h-full relative">
        <div
          className={`absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center text-lg text-[#9ca3af] dark:text-slate-500 font-sans pointer-events-none ${!text && placeholder ? 'flex' : 'hidden'}`}
        >
          {placeholder}<span className="inline-block w-2 h-2 bg-[#9ca3af] dark:bg-slate-500 rounded-full ml-1 align-baseline relative -top-0.5 animate-blink" />
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChangeText}
          placeholder=""
          aria-label="Texto para traducción"
          autoFocus
          spellCheck={false}
          maxLength={MAX_URL_TEXT_LENGTH}
          className="w-full h-[87%] bg-white dark:bg-slate-800 border-none outline-none shadow-none text-[#111111] dark:text-slate-100 p-4 pr-10 pb-6 text-lg resize-none transition-colors duration-200 focus:outline-none focus:shadow-none custom-scrollbar"
        ></textarea>
        {text && (
          <button
            className="absolute top-4 right-4 bg-none border-none cursor-pointer p-0 transition-opacity duration-200 text-[#333] dark:text-slate-400 hover:opacity-80 dark:hover:text-slate-200"
            onClick={clearTextHandler}
            aria-label="Limpiar texto"
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="flex gap-2 items-center mt-2 pl-3 md:pl-4">
        <span className="text-[11px] text-[#999] dark:text-slate-500">
          {text.length.toLocaleString()} / {MAX_URL_TEXT_LENGTH.toLocaleString()}
        </span>

        <button onClick={async () => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
          } catch (err) { console.warn(err); }
        }} className="bg-none border-none text-[#333] cursor-pointer" aria-label="Refrescar dispositivos">↻</button>
      </div>
      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-4">
        {browserSupportsSpeechRecognition ? (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={keepMicOn}
                aria-label="Toggle keep microphone on"
                onClick={() => setKeepMicOn(prev => !prev)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setKeepMicOn(prev => !prev); } }}
                className={`w-11 h-6 rounded-full border-none relative cursor-pointer p-0 transition-colors ${keepMicOn ? 'bg-[#4caf50] dark:bg-green-500' : 'bg-black dark:bg-slate-600'}`}
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
              <span className="text-[#333] dark:text-slate-300 text-xs">{keepMicOn ? "Turn off" : "Turn on"}</span>
            </div>
            <button
              onMouseDown={() => { if (!mediaStreamRef.current && keepMicOn) ensureAudioStreamActive(); }}
              onTouchStart={() => { if (!mediaStreamRef.current && keepMicOn) ensureAudioStreamActive(); }}
              onClick={handleSpeech}
              disabled={isProcessing}
              aria-label={listening ? "Detener reconocimiento" : "Iniciar reconocimiento"}
              className="bg-none border-none cursor-pointer p-1 transition-all duration-200 text-[#111] dark:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50 hover:not-disabled:scale-105"
            >
              {listening ? <PauseIcon /> : <MicIcon />}
            </button>
          </>
        ) : (
          <p>Reconocimiento de voz no soportado</p>
        )}
        {!isMicrophoneAvailable && browserSupportsSpeechRecognition && (
          <div className="text-[#ff4444] text-xs ml-2.5 animate-fadeIn">
            Micrófono no detectado
          </div>
        )}
      </div>
    </div>
  );
};

export default TranslationTextField;
