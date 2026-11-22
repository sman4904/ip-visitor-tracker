
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type BrowserMetadata = {
  device_type?: string;
  device_vendor?: string | null;
  device_model?: string | null;
  os_version?: string | null;
  browser_version?: string | null;

  screen_width?: number;
  screen_height?: number;
  viewport_width?: number;
  viewport_height?: number;
  pixel_ratio?: number;
  color_depth?: number;

  language?: string;
  languages?: string[];
  timezone?: string;
  cookies_enabled?: boolean;
  touch_support?: boolean;

  connection_type?: string | null;
  effective_type?: string | null;
  downlink_mbps?: number | null;
  rtt_ms?: number | null;
};

function validNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function validText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, 200)
    : null;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Read request body
    const body = await request.json();

    if (body.consent !== true) {
      return NextResponse.json(
        { success: false, message: "IP collection consent is required." },
        { status: 403 }
      );
    }

    // 2. Validate Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecret) {
      return NextResponse.json(
        { success: false, message: "Supabase configuration missing." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseSecret);

    // 3. Get visitor IP
    const forwardedFor = request.headers.get("x-forwarded-for");

    const ip =
      request.headers.get("x-real-ip") ||
      forwardedFor?.split(",")[0]?.trim() ||
      null;

    // 4. Get browser and operating system
    const userAgent = request.headers.get("user-agent") || "";

    let browser = "Unknown";
    let browserVersion: string | null = null;

    const browserMatch =
      userAgent.match(/Edg\/([\d.]+)/i) ||
      userAgent.match(/OPR\/([\d.]+)/i) ||
      userAgent.match(/Firefox\/([\d.]+)/i) ||
      userAgent.match(/Chrome\/([\d.]+)/i) ||
      userAgent.match(/Version\/([\d.]+).*Safari/i);

    if (/Edg/i.test(userAgent)) browser = "Edge";
    else if (/OPR/i.test(userAgent)) browser = "Opera";
    else if (/Firefox/i.test(userAgent)) browser = "Firefox";
    else if (/Chrome/i.test(userAgent)) browser = "Chrome";
    else if (/Safari/i.test(userAgent)) browser = "Safari";

    browserVersion = browserMatch?.[1] || null;

    let operatingSystem = "Unknown";
    let osVersion: string | null = null;

    const androidMatch = userAgent.match(/Android\s([\d.]+)/i);
    const iosMatch = userAgent.match(/OS\s([\d_]+)/i);
    const windowsMatch = userAgent.match(/Windows NT\s([\d.]+)/i);
    const macMatch = userAgent.match(/Mac OS X\s([\d_]+)/i);

    if (/Windows/i.test(userAgent)) operatingSystem = "Windows";
    else if (/Android/i.test(userAgent)) operatingSystem = "Android";
    else if (/iPhone|iPad|iPod/i.test(userAgent)) operatingSystem = "iOS";
    else if (/Macintosh|Mac OS X/i.test(userAgent)) operatingSystem = "macOS";
    else if (/Linux/i.test(userAgent)) operatingSystem = "Linux";

    osVersion =
      androidMatch?.[1] ||
      iosMatch?.[1]?.replace(/_/g, ".") ||
      windowsMatch?.[1] ||
      macMatch?.[1]?.replace(/_/g, ".") ||
      null;

    // 5. Validate optional device location
    const deviceConsent = body.preciseLocationConsent === true;
    const submittedLocation = body.deviceLocation;

    let deviceLatitude: number | null = null;
    let deviceLongitude: number | null = null;
    let deviceAccuracy: number | null = null;

    if (deviceConsent && submittedLocation) {
      const lat = validNumber(submittedLocation.latitude);
      const lon = validNumber(submittedLocation.longitude);
      const accuracy = validNumber(submittedLocation.accuracy);

      if (
        lat !== null &&
        lat >= -90 &&
        lat <= 90 &&
        lon !== null &&
        lon >= -180 &&
        lon <= 180 &&
        accuracy !== null &&
        accuracy >= 0
      ) {
        deviceLatitude = lat;
        deviceLongitude = lon;
        deviceAccuracy = accuracy;
      }
    }

    // 6. Validate browser metadata
    const metadata = (
      body.browserMetadata &&
      typeof body.browserMetadata === "object"
        ? body.browserMetadata
        : {}
    ) as BrowserMetadata;

    const deviceType = validText(metadata.device_type);
    const deviceVendor = validText(metadata.device_vendor);
    const deviceModel = validText(metadata.device_model);

    const finalOsVersion =
      validText(metadata.os_version) || osVersion;

    const finalBrowserVersion =
      validText(metadata.browser_version) || browserVersion;

    const screenWidth = validNumber(metadata.screen_width);
    const screenHeight = validNumber(metadata.screen_height);
    const viewportWidth = validNumber(metadata.viewport_width);
    const viewportHeight = validNumber(metadata.viewport_height);
    const pixelRatio = validNumber(metadata.pixel_ratio);
    const colorDepth = validNumber(metadata.color_depth);

    const language = validText(metadata.language);

    const languages = Array.isArray(metadata.languages)
      ? metadata.languages
          .filter((item): item is string => typeof item === "string")
          .slice(0, 20)
      : [];

    const browserTimezone = validText(metadata.timezone);

    const cookiesEnabled =
      typeof metadata.cookies_enabled === "boolean"
        ? metadata.cookies_enabled
        : null;

    const touchSupport =
      typeof metadata.touch_support === "boolean"
        ? metadata.touch_support
        : null;

    const connectionType = validText(metadata.connection_type);
    const effectiveType = validText(metadata.effective_type);

    const downlinkMbps = validNumber(metadata.downlink_mbps);
    const rttMs = validNumber(metadata.rtt_ms);

    // 7. Initialize IP location
    let location = {
      city: null as string | null,
      region: null as string | null,
      country: null as string | null,
      country_code: null as string | null,
      postal: null as string | null,
      timezone: null as string | null,
      latitude: null as number | null,
      longitude: null as number | null,
      isp: null as string | null,
      asn: null as string | null,
    };

    let geolocationStatus = "unavailable";
    let geolocationError: string | null = null;
    let geolocationHttpStatus: number | null = null;

    // 8. Look up IP using ipwho.is
    if (ip) {
      try {
        const response = await fetch(
          `https://ipwho.is/${encodeURIComponent(ip)}`,
          {
            cache: "no-store",
            signal: AbortSignal.timeout(12000),
          }
        );

        geolocationHttpStatus = response.status;
        const result = await response.json();

        if (!response.ok || result.success !== true) {
          geolocationError =
            result.message || `IP lookup failed: ${response.status}`;
        } else {
          location = {
            city: result.city || null,
            region: result.region || null,
            country: result.country || null,
            country_code: result.country_code || null,
            postal: result.postal || null,
            timezone: result.timezone?.id || null,
            latitude:
              typeof result.latitude === "number"
                ? result.latitude
                : null,
            longitude:
              typeof result.longitude === "number"
                ? result.longitude
                : null,
            isp:
              result.connection?.isp ||
              result.connection?.org ||
              null,
            asn:
              result.connection?.asn != null
                ? `AS${result.connection.asn}`
                : null,
          };

          geolocationStatus = "ipwho.is";
        }
      } catch (error) {
        geolocationError =
          error instanceof Error ? error.message : String(error);

        console.error("IP GEOLOCATION ERROR:", geolocationError);
      }
    } else {
      geolocationError = "Visitor IP could not be detected.";
    }

    // 9. Vercel headers as fallback
    const vercelCity = request.headers.get("x-vercel-ip-city");

    if (!location.city && vercelCity) {
      try {
        location.city = decodeURIComponent(vercelCity);
      } catch {
        location.city = vercelCity;
      }
    }

    location.region ||=
      request.headers.get("x-vercel-ip-country-region");

    location.country_code ||=
      request.headers.get("x-vercel-ip-country");

    location.postal ||=
      request.headers.get("x-vercel-ip-postal-code");

    location.timezone ||=
      request.headers.get("x-vercel-ip-timezone");

    if (!location.country && location.country_code === "IN") {
      location.country = "India";
    }

    if (location.latitude === null) {
      const rawLatitude = request.headers.get("x-vercel-ip-latitude");
      const value = rawLatitude ? Number(rawLatitude) : null;

      if (value !== null && Number.isFinite(value)) {
        location.latitude = value;
      }
    }

    if (location.longitude === null) {
      const rawLongitude = request.headers.get("x-vercel-ip-longitude");
      const value = rawLongitude ? Number(rawLongitude) : null;

      if (value !== null && Number.isFinite(value)) {
        location.longitude = value;
      }
    }

    // 10. Determine location source
    const locationSource =
      deviceLatitude !== null && deviceLongitude !== null
        ? "ip+device"
        : "ip";

    // 11. Save visitor information
    const { data, error } = await supabase
      .from("visitors")
      .insert([
        {
          ip_address: ip,

          // IP-based location
          country: location.country,
          country_code: location.country_code,
          region: location.region,
          city: location.city,
          isp: location.isp,
          asn: location.asn,
          postal: location.postal,
          timezone: location.timezone,
          latitude: location.latitude,
          longitude: location.longitude,

          // Device-provided location
          device_latitude: deviceLatitude,
          device_longitude: deviceLongitude,
          device_accuracy_meters: deviceAccuracy,
          location_source: locationSource,

          // Browser and OS
          browser,
          browser_version: finalBrowserVersion,
          operating_system: operatingSystem,
          os_version: finalOsVersion,
          user_agent: userAgent,

          // Device information
          device_type: deviceType,
          device_vendor: deviceVendor,
          device_model: deviceModel,

          // Screen information
          screen_width: screenWidth,
          screen_height: screenHeight,
          viewport_width: viewportWidth,
          viewport_height: viewportHeight,
          pixel_ratio: pixelRatio,
          color_depth: colorDepth,

          // Browser preferences
          language,
          languages,
          browser_timezone: browserTimezone,
          cookies_enabled: cookiesEnabled,
          touch_support: touchSupport,

          // Network conditions
          connection_type: connectionType,
          effective_type: effectiveType,
          downlink_mbps: downlinkMbps,
          rtt_ms: rttMs,
        },
      ])
      .select();

    if (error) {
      console.error("SUPABASE INSERT ERROR:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Failed to save visitor information.",
          error: error.message,
        },
        { status: 500 }
      );
    }

    // 12. Return result
    return NextResponse.json({
      success: true,
      message: "Visitor information saved successfully.",
      ip_address: ip,
      geolocation_status: geolocationStatus,
      geolocation_error: geolocationError,
      geolocation_http_status: geolocationHttpStatus,
      location_source: locationSource,

      ip_location: location,

      device_location: {
        latitude: deviceLatitude,
        longitude: deviceLongitude,
        accuracy_meters: deviceAccuracy,
        status:
          deviceLatitude !== null
            ? "available"
            : deviceConsent
              ? "unavailable_or_denied"
              : "not_requested",
      },

      device_information: {
        device_type: deviceType,
        device_vendor: deviceVendor,
        device_model: deviceModel,
        operating_system: operatingSystem,
        os_version: finalOsVersion,
        browser,
        browser_version: finalBrowserVersion,
      },

      screen_information: {
        screen_width: screenWidth,
        screen_height: screenHeight,
        viewport_width: viewportWidth,
        viewport_height: viewportHeight,
        pixel_ratio: pixelRatio,
        color_depth: colorDepth,
      },

      browser_preferences: {
        language,
        languages,
        timezone: browserTimezone,
        cookies_enabled: cookiesEnabled,
        touch_support: touchSupport,
      },

      network_conditions: {
        connection_type: connectionType,
        effective_type: effectiveType,
        downlink_mbps: downlinkMbps,
        rtt_ms: rttMs,
      },

      data,
    });
  } catch (error) {
    console.error("VISITOR API ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error.",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
