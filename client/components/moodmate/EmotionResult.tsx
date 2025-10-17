import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";

interface EmotionResultProps {
  emotion: string;
  imageSrc?: string;
  onSuggestionReady?: (text: string) => void;
}

function titleForEmotion(emotion: string) {
  const map: Record<string, string> = {
    happy: "You look happy 😄",
    sad: "You look a bit sad 😢",
    angry: "You seem angry 😠",
    surprised: "You look surprised 😮",
    fearful: "Feeling a bit scared? 😨",
    disgusted: "Not impressed? 🤢",
    neutral: "Feeling neutral 🙂",
  };
  return map[emotion] || `Current mood: ${emotion}`;
}

export default function EmotionResult({ emotion, imageSrc, onSuggestionReady }: EmotionResultProps) {
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const shouldFetchJoke = useMemo(() => emotion === "sad", [emotion]);
  const shouldFetchQuote = useMemo(() => emotion === "angry", [emotion]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        let text = "";
        if (shouldFetchJoke) {
          // fetch two jokes concurrently to provide a richer suggestion
          const [a, b] = await Promise.all([fetch('/api/joke'), fetch('/api/joke')]);
          const ja = a.ok ? await a.json() : null;
          const jb = b.ok ? await b.json() : null;
          const jokes = [ja?.joke, jb?.joke].filter(Boolean) as string[];
          const intro = "Hey — I can tell this is a tough moment. Here are a couple of light jokes to hopefully lift you up:\n\n";
          text = intro + (jokes.length > 0 ? jokes.map((j, i) => `${i + 1}. ${j}`).join('\n\n') : "Here's a smile for you!");
        } else if (shouldFetchQuote) {
          const res = await fetch('/api/quote');
          if (!res.ok) throw new Error('Failed to fetch quote');
          const data = await res.json();
          text = data?.quote || "Breathe. Reset. Refocus.";
        } else if (emotion === "happy") {
          text = "Keep smiling! 🌞";
        } else {
          text = "I hope you’re doing well ❤️";
        }
        if (!cancelled) {
          setMessage(text);
          onSuggestionReady?.(text);
        }
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setError("Failed to fetch suggestion. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emotion]);

  const speak = () => {
    if (!("speechSynthesis" in window) || !message) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(message);
    utter.rate = 1.02;
    utter.pitch = 1;
    window.speechSynthesis.speak(utter);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-xl">
      <div className="rounded-2xl p-5 bg-white/70 dark:bg-white/5 ring-1 ring-black/5 shadow-lg backdrop-blur">
        <div className="flex items-start gap-4">
          {imageSrc && (
            <img src={imageSrc} alt="Captured" className="w-28 h-28 rounded-xl object-cover ring-1 ring-black/10" />
          )}
          <div className="flex-1">
            <h3 className="text-xl font-semibold">{titleForEmotion(emotion)}</h3>
            {loading ? (
              <p className="mt-2 text-sm opacity-80">Getting something for you…</p>
            ) : error ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <div className={emotion === 'sad' ? 'mt-3 text-left' : 'mt-2'}>
                {emotion === 'sad' ? (
                  <div>
                    <p className="text-lg font-medium">{`Here's something to help:`}</p>
                    <pre className="mt-3 whitespace-pre-wrap text-base leading-relaxed bg-white/50 dark:bg-black/10 rounded-lg p-4 ring-1 ring-black/5">{message}</pre>
                  </div>
                ) : (
                  <p className="mt-2 text-lg leading-relaxed">{message}</p>
                )}
              </div>
            )}
            <div className="mt-4 flex items-center gap-3">
              <button onClick={speak} className="px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-pink-500 text-white font-semibold shadow hover:from-sky-600 hover:to-pink-600 transition-colors">
                🔊 Speak
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
