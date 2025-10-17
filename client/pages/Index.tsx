import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CameraCapture, { DetectionResult } from "@/components/moodmate/CameraCapture";
import EmotionResult from "@/components/moodmate/EmotionResult";
import FeedbackForm from "@/components/moodmate/FeedbackForm";

export default function Index() {
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("theme") || "light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (result?.emotion) {
      localStorage.setItem("moodmate:lastEmotion", result.emotion);
    }
  }, [result]);

  const lastEmotion = useMemo(() => localStorage.getItem("moodmate:lastEmotion") || "", []);

  const reset = () => setResult(null);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-100 via-indigo-50 to-pink-100 dark:from-slate-900 dark:via-slate-950 dark:to-purple-950 text-slate-800 dark:text-slate-100 flex items-center justify-center px-4 py-10">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          className="px-3 py-2 rounded-full text-sm font-semibold bg-white/70 dark:bg-white/10 backdrop-blur ring-1 ring-black/5 shadow hover:bg-white/90 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>
      </div>

      <main className="w-full max-w-3xl mx-auto text-center">
        <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="text-3xl sm:text-4xl font-extrabold tracking-tight">
          🎭 MoodMate – Your Mood Buddy
        </motion.h1>
        <p className="mt-2 text-sm opacity-80">
          {lastEmotion ? `Last detected mood: ${lastEmotion}` : "Let me help brighten your day ✨"}
        </p>

        <div className="mt-8 flex flex-col items-center">
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div key="camera" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}>
                <CameraCapture onDetected={setResult} />
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} className="w-full flex flex-col items-center">
                <EmotionResult emotion={result.emotion} imageSrc={result.imageSrc} />
                <div className="mt-4 flex items-center gap-3">
                  <button onClick={reset} className="px-4 py-2 rounded-full bg-white/70 dark:bg-white/10 backdrop-blur ring-1 ring-black/5 shadow hover:bg-white transition-colors font-semibold">Try Again</button>
                </div>
                <FeedbackForm />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
