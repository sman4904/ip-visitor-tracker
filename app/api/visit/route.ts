
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    if (/Edg/i.test(userAgent)) browser = "Edge";
    else if (/Firefox/i.test(userAgent)) browser = "Firefox";
    else if (/Chrome/i.test(userAgent)) browser = "Chrome";
    else if (/Safari/i.test(userAgent)) browser = "Safari";

    let operatingSystem = "Unknown";

    if (/Windows/i.test(userAgent)) operatingSystem = "Windows";
    else if (/Android/i.test(userAgent)) operatingSystem = "Android";
    else if (/iPhone|iPad|iPod/i.test(userAgent)) operatingSystem = "iOS";
    else if (/Macintosh|Mac OS X/i.test(userAgent)) operatingSystem = "macOS";
    else if (/Linux/i.test(userAgent)) operatingSystem = "Linux";

    // 5. Validate optional device location
    const deviceConsent = body.preciseLocationConsent === true;
    const submittedLocation = body.deviceLocation;

    let deviceLatitude: number | null = null;
    let deviceLongitude: number | null = null;
    let deviceAccuracy: number | null = null;

    if (deviceConsent && submittedLocation) {
      const lat = submittedLocation.latitude;
      const lon = submittedLocation.longitude;
      const accuracy = submittedLocation.accuracy;

      if (
        typeof lat === "number" &&
        Number.isFinite(lat) &&
        lat >= -90 &&
        lat <= 90 &&
        typeof lon === "number" &&
        Number.isFinite(lon) &&
        lon >= -180 &&
        lon <= 180 &&
        typeof accuracy === "number" &&
        Number.isFinite(accuracy) &&
        accuracy >= 0
      ) {
        deviceLatitude = lat;
        deviceLongitude = lon;
        deviceAccuracy = accuracy;
      }
    }

    // 6. Initialize IP location
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

    // 7. Look up IP using ipwho.is
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

    // 8. Vercel headers as fallback for missing IP location fields
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
      const value = Number(request.headers.get("x-vercel-ip-latitude"));
      if (Number.isFinite(value) && request.headers.get("x-vercel-ip-latitude")) {
        location.latitude = value;
      }
    }

    if (location.longitude === null) {
      const value = Number(request.headers.get("x-vercel-ip-longitude"));
      if (Number.isFinite(value) && request.headers.get("x-vercel-ip-longitude")) {
        location.longitude = value;
      }
    }

    // 9. Determine location source
    let locationSource = "ip";

    if (deviceLatitude !== null && deviceLongitude !== null) {
      locationSource = "ip+device";
    }

    // 10. Save visitor information
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

          // Browser information
          browser,
          operating_system: operatingSystem,
          user_agent: userAgent,
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

    // 11. Return result
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
