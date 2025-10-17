import { useState } from "react";
import { motion } from "framer-motion";

interface FeedbackFormProps {
  onFeedback?: (value: "up" | "down") => void;
}

export default function FeedbackForm({ onFeedback }: FeedbackFormProps) {
  const [submitted, setSubmitted] = useState<null | "up" | "down">(null);

  const handle = (val: "up" | "down") => {
    setSubmitted(val);
    onFeedback?.(val);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="w-full max-w-xl">
      <div className="mt-4 rounded-2xl p-5 bg-white/70 dark:bg-white/5 ring-1 ring-black/5 shadow-lg backdrop-blur text-center">
        {submitted ? (
          <p className="text-sm">{submitted === "up" ? "Thanks! Glad it helped 💙" : "Thanks for the feedback. We'll try better next time 💜"}</p>
        ) : (
          <div className="flex items-center justify-center gap-3">
            <span className="text-sm opacity-80">Did that help?</span>
            <button onClick={() => handle("up")} className="px-4 py-2 rounded-full bg-emerald-500 text-white font-semibold shadow hover:bg-emerald-600 transition-colors">👍</button>
            <button onClick={() => handle("down")} className="px-4 py-2 rounded-full bg-rose-500 text-white font-semibold shadow hover:bg-rose-600 transition-colors">👎</button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
