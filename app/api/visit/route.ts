
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    // 1. Check consent
    const body = await request.json();

    if (body.consent !== true) {
      return NextResponse.json(
        { success: false, message: "User consent is required." },
        { status: 403 }
      );
    }

    // 2. Check Supabase configuration
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseSecret) {
      return NextResponse.json(
        { success: false, message: "Supabase configuration missing." },
        { status: 500 }
      );
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseSecret
    );

    // 3. Get visitor IP
    const forwardedFor = request.headers.get("x-forwarded-for");

    const ip =
      request.headers.get("x-real-ip") ||
      forwardedFor?.split(",")[0]?.trim() ||
      null;

    // 4. Get user agent
    const userAgent = request.headers.get("user-agent") || "";

    // 5. Detect browser
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

    // 6. Detect operating system
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

    // 7. Vercel location headers (fallback only)
    const vercelLocation = {
      city: request.headers.get("x-vercel-ip-city"),
      region: request.headers.get("x-vercel-ip-country-region"),
      countryCode: request.headers.get("x-vercel-ip-country"),
      postal: request.headers.get("x-vercel-ip-postal-code"),
      timezone: request.headers.get("x-vercel-ip-timezone"),
      latitude: request.headers.get("x-vercel-ip-latitude"),
      longitude: request.headers.get("x-vercel-ip-longitude"),
    };

    // 8. Initialize location
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

    // 9. Look up IP using ipwho.is
    if (ip) {
      try {
        const response = await fetch(
          `https://ipwho.is/${encodeURIComponent(ip)}`,
          {
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          }
        );

        geolocationHttpStatus = response.status;

        const rawResponse = await response.text();

        console.log("VISITOR IP:", ip);
        console.log("IPWHO STATUS:", response.status);
        console.log("IPWHO RESPONSE:", rawResponse);

        const result = JSON.parse(rawResponse);

        if (!response.ok || result.success !== true) {
          geolocationError =
            result.message || `IPWHO HTTP error: ${response.status}`;
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

            isp: result.connection?.isp ||
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
          error instanceof Error
            ? error.message
            : String(error);

        console.error("IPWHO LOOKUP FAILED:", geolocationError);
      }
    } else {
      geolocationError = "Visitor IP could not be detected.";
    }

    // 10. Use Vercel headers only for missing values
    if (!location.city && vercelLocation.city) {
      try {
        location.city = decodeURIComponent(vercelLocation.city);
      } catch {
        location.city = vercelLocation.city;
      }
    }

    location.region ||= vercelLocation.region;
    location.country_code ||= vercelLocation.countryCode;
    location.postal ||= vercelLocation.postal;
    location.timezone ||= vercelLocation.timezone;

    if (
      location.latitude === null &&
      vercelLocation.latitude
    ) {
      const value = Number(vercelLocation.latitude);

      if (Number.isFinite(value)) {
        location.latitude = value;
      }
    }

    if (
      location.longitude === null &&
      vercelLocation.longitude
    ) {
      const value = Number(vercelLocation.longitude);

      if (Number.isFinite(value)) {
        location.longitude = value;
      }
    }

    if (!location.country && location.country_code === "IN") {
      location.country = "India";
    }

    // 11. Save visitor information
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
          browser,
          operating_system: operatingSystem,
          user_agent: userAgent,
        },
      ])
      .select();

    if (error) {
      console.error("SUPABASE ERROR:", error);

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
      location,
      data,
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
