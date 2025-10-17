import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as faceapi from "face-api.js";
import { motion } from "framer-motion";

const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

export type DetectionResult = {
  emotion: string;
  imageSrc: string;
  confidence?: number;
};

interface CameraCaptureProps {
  onDetected: (result: DetectionResult) => void;
}

const videoConstraints: MediaTrackConstraints = {
  facingMode: "user",
};

function getTopEmotion(expressions: Record<string, number> | undefined): { key: string; value: number } {
  if (!expressions) return { key: "neutral", value: 0 };
  let top = { key: "neutral", value: -1 };
  Object.entries(expressions).forEach(([key, value]) => {
    if (typeof value === "number" && value > top.value) top = { key, value };
  });
  return top;
}

export default function CameraCapture({ onDetected }: CameraCaptureProps) {
  const webcamRef = useRef<Webcam | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fast/full model states
  const [fastModelsLoaded, setFastModelsLoaded] = useState(false);
  const [fullModelsLoaded, setFullModelsLoaded] = useState(false);
  const ready = useMemo(() => fastModelsLoaded && !detecting, [fastModelsLoaded, detecting]);

  useEffect(() => {
    let cancelled = false;

    async function loadFast() {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) setFastModelsLoaded(true);
      } catch (e) {
        console.error("Failed to load fast models", e);
        if (!cancelled) setError("Failed to load fast face models. Check your connection.");
      }
    }

    async function loadFull() {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        ]);
        if (!cancelled) setFullModelsLoaded(true);
      } catch (e) {
        console.error("Failed to load full models", e);
      }
    }

    loadFast();
    // load full models in background
    loadFull();

    return () => {
      cancelled = true;
    };
  }, []);

  // helper: fetch with timeout
  const fetchWithTimeout = async (input: RequestInfo, init?: RequestInit, timeout = 8000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(input, { ...(init || {}), signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  };

  // Capture and do fast provisional detection, then run full pipeline async and update when available
  const captureAndDetect = useCallback(async () => {
    if (!webcamRef.current) return;
    setError(null);
    setDetecting(true);

    let imageSrc: string | null = null;

    try {
      imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) throw new Error("Unable to capture image");

      // load image
      const img = new Image();
      img.src = imageSrc;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
      });

      // Quick detection using tinyFaceDetector (fast)
      let quickEmotion = "neutral";
      let quickConfidence = 0.5;
      try {
        const det = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 })).withFaceExpressions();
        const qExpr = det?.expressions;
        const top = getTopEmotion(qExpr as any);
        quickEmotion = top.value >= 0.2 ? top.key : "neutral";
        quickConfidence = Math.max(0.01, Math.min(0.99, top.value ?? 0.5));
      } catch (e) {
        console.warn("Quick detection failed", e);
      }

      // Immediately notify provisional result so UI is responsive
      onDetected({ emotion: quickEmotion, imageSrc, confidence: quickConfidence });

      // Background full analysis
      (async () => {
        try {
          // If full models not yet loaded, try a single ssd detection using tiny as fallback
          const frames = fullModelsLoaded ? 3 : 1;
          const accum: Record<string, number> = {};

          for (let i = 0; i < frames; i++) {
            // get fresh screenshot for each frame if possible
            const src = i === 0 ? imageSrc : webcamRef.current?.getScreenshot();
            if (!src) continue;
            const tempImg = new Image();
            tempImg.src = src;
            await new Promise<void>((resolve, reject) => {
              tempImg.onload = () => resolve();
              tempImg.onerror = () => reject(new Error("Failed to load image"));
            });

            const detectorOptions = fullModelsLoaded ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }) : new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 });
            const detection = fullModelsLoaded
              ? await faceapi.detectSingleFace(tempImg, detectorOptions).withFaceLandmarks().withFaceExpressions()
              : await faceapi.detectSingleFace(tempImg, detectorOptions).withFaceExpressions();

            const expressions = detection?.expressions as Record<string, number> | undefined;
            if (expressions) {
              Object.entries(expressions).forEach(([k, v]) => {
                accum[k] = (accum[k] || 0) + (typeof v === "number" ? v : 0);
              });
            }

            if (frames > 1) await new Promise((r) => setTimeout(r, 120));
          }

          const averaged: Record<string, number> = {};
          Object.entries(accum).forEach(([k, v]) => {
            averaged[k] = v / Math.max(1, frames);
          });

          // determine top
          const top = getTopEmotion(averaged);
          const finalScore = Math.max(0, Math.min(1, top.value ?? 0));
          let finalEmotion = finalScore >= 0.35 ? top.key : "neutral";
          let finalConfidence = finalScore;

          // landmark heuristics if available
          if (fullModelsLoaded) {
            try {
              const tmp = new Image();
              tmp.src = imageSrc!;
              await new Promise<void>((resolve) => (tmp.onload = () => resolve()));
              const det = await faceapi.detectSingleFace(tmp, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })).withFaceLandmarks().withFaceExpressions();
              const lm = det?.landmarks;
              const exprs = det?.expressions;
              if (lm && exprs) {
                const mouth = lm.getMouth();
                const leftEye = lm.getLeftEye();
                const rightEye = lm.getRightEye();
                // compute simple heuristics
                const eyeDist = Math.hypot(leftEye[0].x - rightEye[3].x, leftEye[0].y - rightEye[3].y) || 1;
                const leftCorner = mouth[0];
                const rightCorner = mouth[mouth.length - 1];
                const topLip = mouth[Math.floor(mouth.length / 2) - 1] || mouth[3];
                const bottomLip = mouth[Math.floor(mouth.length / 2) + 1] || mouth[9];
                const mouthCenterY = (topLip.y + bottomLip.y) / 2;
                const mouthCornerDepression = ((leftCorner.y + rightCorner.y) / 2 - mouthCenterY) / eyeDist;
                const mouthWidthNorm = Math.hypot(leftCorner.x - rightCorner.x, leftCorner.y - rightCorner.y) / eyeDist;
                const browInnerYAvg = lm.getLeftEyeBrow()[Math.floor(lm.getLeftEyeBrow().length / 2)].y;
                const eyeCenterY = (leftEye[0].y + rightEye[3].y) / 2;
                const browToEye = (browInnerYAvg - eyeCenterY) / eyeDist;
                if (mouthCornerDepression > 0.045 || (exprs && (exprs.sad ?? 0) > 0.18)) {
                  finalEmotion = "sad";
                  finalConfidence = Math.max(finalConfidence, exprs.sad ?? 0.6);
                }
                if (browToEye > 0.03 && mouthWidthNorm < 0.45) {
                  finalEmotion = "angry";
                  finalConfidence = Math.max(finalConfidence, exprs.angry ?? 0.6);
                }
              }
            } catch (e) {
              // ignore landmark heuristic errors
            }
          }

          // If finalEmotion still neutral, try OpenAI fallback asynchronously with timeout
          if (finalEmotion === "neutral") {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 8000);
              const res = await fetch('/api/classify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageSrc, expressions: averaged }),
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              if (res.ok) {
                const data = await res.json();
                const conf = Math.max(0, Math.min(1, Number(data.confidence ?? 0)));
                if (data?.emotion && conf >= 0.2) {
                  finalEmotion = String(data.emotion);
                  finalConfidence = Math.max(finalConfidence, conf);
                }
              }
            } catch (e) {
              console.warn('OpenAI fallback (async) failed', e);
            }
          }

          // If improved/different from quickEmotion, update UI only if finalConfidence significantly higher
          const qc = quickConfidence ?? 0.5;
          if (finalEmotion && finalEmotion !== quickEmotion) {
            const needsUpdate = finalConfidence >= qc + 0.15 || finalConfidence >= 0.5;
            if (needsUpdate) {
              onDetected({ emotion: finalEmotion, imageSrc: imageSrc!, confidence: finalConfidence });
            } else {
              // keep provisional if confidence not significantly higher
              console.debug('Skipping update: final not strong enough', { quickEmotion, qc, finalEmotion, finalConfidence });
            }
          }
        } catch (e) {
          console.error('Background analysis failed', e);
        } finally {
          setDetecting(false);
        }
      })();

    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Something went wrong while detecting emotion");
      setDetecting(false);
    }
  }, [onDetected, fullModelsLoaded]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-xl">
      <div className="relative rounded-2xl overflow-hidden shadow-xl ring-1 ring-black/5 bg-white/70 dark:bg-white/5 backdrop-blur">
        <div className="aspect-video">
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={captureAndDetect}
          disabled={!ready}
          className="px-5 py-3 rounded-full font-semibold text-white bg-gradient-to-r from-sky-500 to-pink-500 disabled:opacity-50 shadow hover:from-sky-600 hover:to-pink-600 transition-colors"
        >
          {!fastModelsLoaded ? "Loading models…" : detecting ? "Detecting…" : "Capture & Detect Emotion"}
        </button>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </motion.div>
  );
}
