
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

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

    // 2. Check environment variables
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SECRET_KEY
    ) {
      return NextResponse.json(
        { success: false, message: "Supabase configuration missing." },
        { status: 500 }
      );
    }

    // 3. Get visitor IP
    const forwardedFor = request.headers.get("x-forwarded-for");

    const ip =
      request.headers.get("x-real-ip") ||
      forwardedFor?.split(",")[0]?.trim() ||
      null;

    // 4. Get User Agent
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
    } else if (/Mac OS X|Macintosh/i.test(userAgent)) {
      operatingSystem = "macOS";
    } else if (/Linux/i.test(userAgent)) {
      operatingSystem = "Linux";
    }

    // 7. Get Vercel geolocation headers as fallback
    const vercelLocation = {
      city: request.headers.get("x-vercel-ip-city"),
      region: request.headers.get("x-vercel-ip-country-region"),
      country_code: request.headers.get("x-vercel-ip-country"),
      postal: request.headers.get("x-vercel-ip-postal-code"),
      timezone: request.headers.get("x-vercel-ip-timezone"),
      latitude: request.headers.get("x-vercel-ip-latitude"),
      longitude: request.headers.get("x-vercel-ip-longitude"),
    };

    // 8. Initialize location information
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

    // 9. Get accurate available IP information
    if (ip) {
      try {
        const response = await fetch(
          `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
          {
            cache: "no-store",
            signal: AbortSignal.timeout(10000),
          }
        );

        if (response.ok) {
          const data = await response.json();

          if (!data.error) {
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
        console.error("IP geolocation error:", error);
      }
    }

    // 10. Use Vercel headers only for missing values
    location.city ||= vercelLocation.city;
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

    // 11. Set country name if missing
    if (!location.country && location.country_code === "IN") {
      location.country = "India";
    }

    // 12. Save visitor information to Supabase
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
      console.error("Supabase insert error:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Failed to save visitor information.",
          error: error.message,
        },
        { status: 500 }
      );
    }

    // 13. Return successful response
    return NextResponse.json({
      success: true,
      message: "Visitor information saved successfully.",
      geolocation_status: geolocationStatus,
      location: location,
      data: data,
    });
  } catch (error) {
    console.error("Visitor API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error.",
      },
      { status: 500 }
    );
  }
}
