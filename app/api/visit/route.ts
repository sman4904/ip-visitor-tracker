
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Check visitor consent
    if (body.consent !== true) {
      return NextResponse.json(
        { message: "Consent is required." },
        { status: 400 }
      );
    }

    // 2. Connect to Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    );

    // 3. Get visitor IP
    const forwardedFor = request.headers.get("x-forwarded-for");

    const ip =
      request.headers.get("x-real-ip") ||
      forwardedFor?.split(",")[0].trim() ||
      null;

    if (!ip) {
      return NextResponse.json(
        { message: "IP address unavailable." },
        { status: 400 }
      );
    }

    const userAgent =
      request.headers.get("user-agent") || "";

    // 4. Detect browser
    const browser =
      /Edg\//.test(userAgent) ? "Edge" :
      /Firefox\//.test(userAgent) ? "Firefox" :
      /Chrome\//.test(userAgent) ? "Chrome" :
      /Safari\//.test(userAgent) ? "Safari" :
      "Other";

    // 5. Detect operating system
    const os =
      /Windows/.test(userAgent) ? "Windows" :
      /Android/.test(userAgent) ? "Android" :
      /iPhone|iPad/.test(userAgent) ? "iOS" :
      /Mac OS/.test(userAgent) ? "macOS" :
      /Linux/.test(userAgent) ? "Linux" :
      "Other";

    // 6. Initialize location information
    let location = {
      country: null as string | null,
      country_code: null as string | null,
      region: null as string | null,
      city: null as string | null,
      isp: null as string | null,
      asn: null as string | null,
      postal: null as string | null,
      timezone: null as string | null,
      latitude: null as number | null,
      longitude: null as number | null
    };

    // 7. Get approximate IP location
    try {
      const response = await fetch(
        `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
        {
          signal: AbortSignal.timeout(5000),
          headers: {
            "Accept": "application/json"
          }
        }
      );

      if (response.ok) {
        const data = await response.json();

        if (!data.error) {
          location = {
            country: data.country_name || null,
            country_code: data.country_code || null,
            region: data.region || null,
            city: data.city || null,
            isp: data.org || null,
            asn: data.asn || null,
            postal: data.postal || null,
            timezone: data.timezone || null,
            latitude: data.latitude ?? null,
            longitude: data.longitude ?? null
          };
        }
      }
    } catch {
      console.log("IP location lookup unavailable.");
    }

    // 8. Save visitor information in Supabase
    const { error } = await supabase
      .from("visitors")
      .insert({
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
        operating_system: os,
        user_agent: userAgent
      });

    if (error) {
      console.error("Supabase error:", error);

      return NextResponse.json(
        { message: "Database error." },
        { status: 500 }
      );
    }

    // 9. Success response
    return NextResponse.json({
      message: "Visitor information recorded successfully!"
    });

  } catch (error) {
    console.error("Visitor tracking error:", error);

    return NextResponse.json(
      { message: "Something went wrong." },
      { status: 500 }
    );
  }
}
