
"use client";

import { useState } from "react";

type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type BrowserMetadata = {
  device_type: string;
  device_vendor: string | null;
  device_model: string | null;
  os_version: string | null;
  browser_version: string | null;
  screen_width: number;
  screen_height: number;
  viewport_width: number;
  viewport_height: number;
  pixel_ratio: number;
  color_depth: number;
  language: string;
  languages: string[];
  timezone: string;
  cookies_enabled: boolean;
  touch_support: boolean;
  connection_type: string | null;
  effective_type: string | null;
  downlink_mbps: number | null;
  rtt_ms: number | null;
};

type NavigatorWithHints = Navigator & {
  userAgentData?: {
    mobile?: boolean;
    platform?: string;
    getHighEntropyValues?: (
      hints: string[]
    ) => Promise<{
      model?: string;
      platformVersion?: string;
      fullVersionList?: Array<{
        brand: string;
        version: string;
      }>;
    }>;
  };

  connection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  };
};

// Collect browser and device information
async function getBrowserMetadata(): Promise<BrowserMetadata> {
  const nav = navigator as NavigatorWithHints;
  const ua = navigator.userAgent;

  let deviceType = /iPad|Tablet/i.test(ua)
    ? "Tablet"
    : /Mobile|Android|iPhone|iPod/i.test(ua)
      ? "Mobile"
      : "Desktop";

  let deviceVendor: string | null = null;
  let deviceModel: string | null = null;
  let osVersion: string | null = null;
  let browserVersion: string | null = null;

  // Browser version
  const browserMatch =
    ua.match(/Edg\/([\d.]+)/) ||
    ua.match(/OPR\/([\d.]+)/) ||
    ua.match(/Firefox\/([\d.]+)/) ||
    ua.match(/Chrome\/([\d.]+)/) ||
    ua.match(/Version\/([\d.]+).*Safari/);

  browserVersion = browserMatch?.[1] || null;

  // Operating system version
  const androidMatch = ua.match(/Android\s([\d.]+)/i);
  const iosMatch = ua.match(/OS\s([\d_]+)/i);
  const windowsMatch = ua.match(/Windows NT\s([\d.]+)/i);
  const macMatch = ua.match(/Mac OS X\s([\d_]+)/i);

  osVersion =
    androidMatch?.[1] ||
    iosMatch?.[1]?.replace(/_/g, ".") ||
    windowsMatch?.[1] ||
    macMatch?.[1]?.replace(/_/g, ".") ||
    null;

  // Best-effort manufacturer detection
  if (/Samsung/i.test(ua)) deviceVendor = "Samsung";
  else if (/Pixel/i.test(ua)) deviceVendor = "Google";
  else if (/OnePlus/i.test(ua)) deviceVendor = "OnePlus";
  else if (/Xiaomi|Redmi|POCO/i.test(ua)) deviceVendor = "Xiaomi";
  else if (/OPPO/i.test(ua)) deviceVendor = "OPPO";
  else if (/vivo/i.test(ua)) deviceVendor = "vivo";
  else if (/iPhone|iPad/i.test(ua)) deviceVendor = "Apple";

  // Enhanced device information where supported
  try {
    if (nav.userAgentData) {
      deviceType = nav.userAgentData.mobile ? "Mobile" : "Desktop";

      const hints = await nav.userAgentData.getHighEntropyValues?.([
        "model",
        "platformVersion",
        "fullVersionList",
      ]);

      if (hints) {
        deviceModel = hints.model || null;
        osVersion = hints.platformVersion || osVersion;

        const preferredBrowser = hints.fullVersionList?.find(
          (item) =>
            /Google Chrome|Microsoft Edge|Opera/i.test(item.brand)
        );

        browserVersion =
          preferredBrowser?.version || browserVersion;
      }
    }
  } catch (error) {
    console.warn("Additional device information unavailable:", error);
  }

  const connection = nav.connection;

  return {
    device_type: deviceType,
    device_vendor: deviceVendor,
    device_model: deviceModel,
    os_version: osVersion,
    browser_version: browserVersion,

    screen_width: window.screen.width,
    screen_height: window.screen.height,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    pixel_ratio: window.devicePixelRatio || 1,
    color_depth: window.screen.colorDepth,

    language: navigator.language || "",
    languages: Array.from(navigator.languages || []),
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",

    cookies_enabled: navigator.cookieEnabled,

    touch_support:
      navigator.maxTouchPoints > 0 ||
      "ontouchstart" in window,

    connection_type: connection?.type || null,
    effective_type: connection?.effectiveType || null,

    downlink_mbps:
      typeof connection?.downlink === "number"
        ? connection.downlink
        : null,

    rtt_ms:
      typeof connection?.rtt === "number"
        ? connection.rtt
        : null,
  };
}

// Existing GPS functionality
function getDeviceLocation(): Promise<DeviceLocation | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        console.error("Device location error:", error.message);
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  });
}

export default function Home() {
  const [ipConsent, setIpConsent] = useState(false);
  const [gpsConsent, setGpsConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleContinue() {
    if (!ipConsent) {
      setMessage("Please accept IP-based visitor data collection.");
      return;
    }

    setLoading(true);
    setMessage("Getting things ready for you... 💗");

    try {
      // 1. Collect browser and device information
      const browserMetadata = await getBrowserMetadata();

      // 2. Collect GPS only with separate consent
      let deviceLocation: DeviceLocation | null = null;

      if (gpsConsent) {
        setMessage("Waiting for your location permission... 📍");
        deviceLocation = await getDeviceLocation();
      }

      // 3. Send everything to the existing API
      setMessage("Saving your preferences... ✨");

      const response = await fetch("/api/visit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          consent: true,
          preciseLocationConsent: gpsConsent,
          deviceLocation,
          browserMetadata,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Unable to save information."
        );
      }

      if (result.device_location.status === "available") {
        setMessage(
          `Yay! Your device location was recorded! 💗 Accuracy: approximately ${Math.round(
            result.device_location.accuracy_meters
          )} metres. You are cooked lil bro`
        );
      } else if (gpsConsent) {
        setMessage(
          "Your visitor information was saved! Device location wasn't available, but that's okay. 🌸"
        );
      } else {
        setMessage(
          "All done! Your visitor information was saved successfully. 💕"
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Oops! Something went wrong. Please try again. 💔"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fff5f8] text-[#554354] flex items-center justify-center px-5 py-12">

      {/* Decorative floating elements */}
      <div className="pointer-events-none absolute top-10 left-10 text-5xl opacity-40 animate-bounce">
        ♡
      </div>

      <div className="pointer-events-none absolute top-20 right-12 text-4xl opacity-50 animate-pulse">
        ✿
      </div>

      <div className="pointer-events-none absolute bottom-16 left-16 text-4xl opacity-40 animate-pulse">
        ✨
      </div>

      <div className="pointer-events-none absolute bottom-12 right-12 text-5xl opacity-40 animate-bounce">
        🌷
      </div>

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-xl rounded-[2rem] border border-pink-100 bg-white/90 p-7 sm:p-9 shadow-[0_20px_70px_rgba(226,120,160,0.15)] backdrop-blur-xl">

        {/* Header */}
        <div className="mb-8 text-center">

          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-pink-200 to-purple-200 text-4xl shadow-lg shadow-pink-100 transition-transform duration-300 hover:rotate-12 hover:scale-110">
            🌸
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.3em] text-pink-400">
            A little visitor check-in
          </p>

          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-[#61465b]">
            It is just an interactive test
            <span className="text-pink-400"> website </span>
          </h1>

          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#a18b9d]">
            Before we begin, let's get to know your visit! 💗
          </p>
        </div>

        {/* Consent Options */}
        <div className="space-y-4">

          {/* IP and Technical Information Consent */}
          <label
            className={`group flex cursor-pointer gap-4 rounded-2xl border-2 p-5 transition-all duration-300 ${
              ipConsent
                ? "border-pink-300 bg-pink-50 shadow-md shadow-pink-100"
                : "border-pink-100 bg-[#fffafd] hover:border-pink-200 hover:bg-pink-50/50"
            }`}
          >
            <input
              type="checkbox"
              checked={ipConsent}
              onChange={(event) =>
                setIpConsent(event.target.checked)
              }
              disabled={loading}
              className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-pink-500"
            />

            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 font-bold text-[#684c60]">
                🌐 Meet through your network

                <span className="rounded-full bg-pink-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-pink-700">
                  Required
                </span>
              </span>

              <span className="mt-2 block text-sm leading-6 text-[#a18b9d]">
                yap yap yap
              </span>
            </span>
          </label>

          {/* GPS Consent */}
          <label
            className={`group flex cursor-pointer gap-4 rounded-2xl border-2 p-5 transition-all duration-300 ${
              gpsConsent
                ? "border-purple-300 bg-purple-50 shadow-md shadow-purple-100"
                : "border-purple-100 bg-[#fcfaff] hover:border-purple-200 hover:bg-purple-50/50"
            }`}
          >
            <input
              type="checkbox"
              checked={gpsConsent}
              onChange={(event) =>
                setGpsConsent(event.target.checked)
              }
              disabled={loading}
              className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-purple-500"
            />

            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 font-bold text-[#684c60]">
                📍Just click on this

                <span className="rounded-full bg-purple-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  Required
                </span>
              </span>

              <span className="mt-2 block text-sm leading-6 text-[#a18b9d]">
                
              </span>
            </span>
          </label>

        </div>

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          disabled={loading || !ipConsent}
          className="group mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-pink-400 to-rose-400 px-5 py-4 font-bold text-white shadow-lg shadow-pink-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-pink-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          <span>
            {loading ? "Just a moment..." : "Let's Go!"}
          </span>

          <span className="transition-transform duration-300 group-hover:translate-x-1">
            {loading ? "💭" : "♡"}
          </span>
        </button>

        {/* Status Message */}
        {message && (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 rounded-2xl border border-pink-100 bg-pink-50 p-4 text-center text-sm leading-6 text-[#936d86] animate-in fade-in duration-300"
          >
            {message}
          </div>
        )}

        {/* Privacy Footer */}
        <div className="mt-7 border-t border-pink-100 pt-5 text-center">
          <p className="text-xs leading-6 text-[#b49eae]">
          
          </p>

          <p className="mt-3 text-xs font-semibold text-pink-300">
            Made with ♡ and a little bit of magic
          </p>
        </div>

      </div>
    </main>
  );
}
