
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    // 1. Check user consent
    const body = await request.json();

    if (body.consent !== true) {
      return NextResponse.json(
        {
          success: false,
          message: "User consent is required.",
        },
        { status: 403 }
      );
    }

    // 2. Check environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecret) {
      return NextResponse.json(
        {
          success: false,
          message: "Supabase environment variables are missing.",
        },
        { status: 500 }
      );
    }

    // 3. Connect to Supabase
    const supabase = createClient(
      supabaseUrl,
      supabaseSecret
    );

    // 4. Get visitor IP
    const forwardedFor = request.headers.get("x-forwarded-for");

    const ip =
      request.headers.get("x-real-ip") ||
      forwardedFor?.split(",")[0]?.trim() ||
      null;

    // 5. Get user agent
    const userAgent = request.headers.get("user-agent") || "";

    // 6. Detect browser
    let browser = "Unknown";

    if (/Edg/i.test(userAgent)) {
      browser = "Edge";
    } else if (/Firefox/i.test(userAgent)) {
      browser = "Firefox";
    } else if (/Chrome/i.test(userAgent)) {
      browser = "Chrome";
    } else if (/Safari/i.test(userAgent)) {
      browser = "Safari";
    }

    // 7. Detect operating system
    let operatingSystem = "Unknown";

    if (/Windows/i.test(userAgent)) {
      operatingSystem = "Windows";
    } else if (/Android/i.test(userAgent)) {
      operatingSystem = "Android";
    } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
      operatingSystem = "iOS";
    } else if (/Macintosh|Mac OS X/i.test(userAgent)) {
      operatingSystem = "macOS";
    } else if (/Linux/i.test(userAgent)) {
      operatingSystem = "Linux";
    }

    // 8. Get Vercel geolocation headers
    const vercelLocation = {
      city: request.headers.get("x-vercel-ip-city"),
      region: request.headers.get("x-vercel-ip-country-region"),
      country_code: request.headers.get("x-vercel-ip-country"),
      postal: request.headers.get("x-vercel-ip-postal-code"),
      timezone: request.headers.get("x-vercel-ip-timezone"),
      latitude: request.headers.get("x-vercel-ip-latitude"),
      longitude: request.headers.get("x-vercel-ip-longitude"),
    };

    // 9. Initialize location
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

    // 10. Diagnostic information
    let geolocationStatus = "unavailable";
    let geolocationError: string | null = null;
    let ipapiHttpStatus: number | null = null;

    // 11. Look up visitor IP using ipapi
    if (ip) {
      try {
        const response = await fetch(
          `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
          {
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          }
        );

        ipapiHttpStatus = response.status;

        const rawResponse = await response.text();

        console.log("VISITOR IP:", ip);
        console.log("IPAPI HTTP STATUS:", response.status);
        console.log("IPAPI RESPONSE:", rawResponse);

        if (!response.ok) {
          geolocationError =
            `HTTP ${response.status}: ${rawResponse.slice(0, 500)}`;
        } else {
          const data = JSON.parse(rawResponse);

          if (data.error) {
            geolocationError =
              data.reason || "IPAPI returned an error.";
          } else {
            location = {
              city: data.city || null,
              region: data.region || null,
              country: data.country_name || null,
              country_code: data.country_code || null,
              postal: data.postal || null,
              timezone: data.timezone || null,

              latitude:
                typeof data.latitude === "number"
                  ? data.latitude
                  : null,

              longitude:
                typeof data.longitude === "number"
                  ? data.longitude
                  : null,

              isp: data.org || null,
              asn: data.asn || null,
            };

            geolocationStatus = "ipapi";
          }
        }
      } catch (error) {
        geolocationError =
          error instanceof Error
            ? error.message
            : String(error);

        console.error("IPAPI LOOKUP FAILED:", geolocationError);
      }
    } else {
      geolocationError = "Visitor IP address could not be detected.";
    }

    // 12. Use Vercel headers only for missing information
    if (!location.city && vercelLocation.city) {
      try {
        location.city = decodeURIComponent(vercelLocation.city);
      } catch {
        location.city = vercelLocation.city;
      }
    }

    location.region ||= vercelLocation.region;
    location.country_code ||= vercelLocation.country_code;
    location.postal ||= vercelLocation.postal;
    location.timezone ||= vercelLocation.timezone;

    if (
      location.latitude === null &&
      vercelLocation.latitude
    ) {
      const latitude = Number(vercelLocation.latitude);

      if (Number.isFinite(latitude)) {
        location.latitude = latitude;
      }
    }

    if (
      location.longitude === null &&
      vercelLocation.longitude
    ) {
      const longitude = Number(vercelLocation.longitude);

      if (Number.isFinite(longitude)) {
        location.longitude = longitude;
      }
    }

    // 13. Country name fallback
    if (!location.country && location.country_code === "IN") {
      location.country = "India";
    }

    // 14. Save visitor information to Supabase
    const { data, error } = await supabase
      .from("visitors")
      .insert([
        {
          ip_address: ip,
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
          browser: browser,
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
          geolocation_status: geolocationStatus,
          geolocation_error: geolocationError,
          ipapi_http_status: ipapiHttpStatus,
        },
        { status: 500 }
      );
    }

    // 15. Return result and debugging information
    return NextResponse.json({
      success: true,
      message: "Visitor information saved successfully.",

      ip_address: ip,

      geolocation_status: geolocationStatus,
      geolocation_error: geolocationError,
      ipapi_http_status: ipapiHttpStatus,

      location: location,

      data: data,
    });

  } catch (error) {
    console.error("VISITOR API ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error.",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
