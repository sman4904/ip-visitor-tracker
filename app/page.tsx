
"use client";

import { useState } from "react";

export default function Home() {
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function recordVisit() {
    if (!consent) {
      setMessage("Please accept the privacy notice first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/visit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ consent: true })
      });

      const data = await response.json();
      setMessage(data.message || "Request completed.");
    } catch {
      setMessage("Unable to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-white flex items-center justify-center p-6">

      <div className="w-full max-w-lg">

        <div className="text-center mb-10">
          <div className="text-5xl mb-5">🌐</div>

          <h1 className="text-4xl font-bold tracking-tight">
            Welcome!
          </h1>

          <p className="text-gray-400 mt-3">
            Explore our website and experience something new.
          </p>
        </div>

        <div className="bg-[#18181b] border border-gray-800 rounded-2xl p-7">

          <h2 className="text-xl font-semibold mb-3">
            Notice
          </h2>

          <p className="text-gray-400 text-sm leading-7">
            Before continuing, please know that this website
            is made with love, so please take a moment and appriciate the work :) .
          </p>

          <div className="mt-6 flex items-start gap-3">

            <input
              type="checkbox"
              id="consent"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 accent-yellow-500"
            />

            <label
              htmlFor="consent"
              className="text-sm text-gray-300 cursor-pointer"
            >
              hell yeahhhhhh
            </label>

          </div>

          <button
            onClick={recordVisit}
            disabled={loading || !consent}
            className="w-full mt-7 py-3 rounded-xl font-semibold
            bg-yellow-500 text-black hover:bg-yellow-400
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all"
          >
            {loading ? "Please wait..." : "Continue"}
          </button>

          {message && (
            <p className="text-center text-sm mt-5 text-gray-300">
              {message}
            </p>
          )}

        </div>

        <p className="text-center text-xs text-gray-600 mt-7">
          Your privacy matters. Information is used for
          disclosed website analytics.
        </p>

      </div>
    </main>
  );
}
