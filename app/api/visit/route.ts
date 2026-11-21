
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    // 1. Check visitor consent
    const body = await request.json();

    if (body.consent !== true) {
      return NextResponse.json(
        { message: "Consent is required." },
        { status: 400 }
      );
    }

    // 2. Check environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase environment variables.");

      return NextResponse.json(
        { message: "Server configuration error." },
        { status: 500 }
      );
    }

    // 3. Connect to Supabase
    const supabase = createClient(
      supabaseUrl,
      supabaseKey
    );

    // 4. Get visitor IP
    const forwardedFor =
      request.headers.get("x-forwarded-for");

    const ip =
      request.headers.get("x-real-ip") ||
      forwardedFor?.split(",")[0]?.trim() ||
      null;

    if (!ip) {
      return NextResponse.json(
        { message: "IP address unavailable." },
        { status: 400 }
      );
    }

    // 5. Get browser information
    const userAgent =
      request.headers.get("user-agent") || "";

    const browser =
      /Edg\//.test(userAgent) ? "Edge" :
      /Firefox\//.test(userAgent) ? "Firefox" :
      /Chrome\//.test(userAgent) ? "Chrome" :
      /Safari\//.test(userAgent) ? "Safari" :
      "Other";

    // 6. Detect operating system
    const os =
      /Windows/.test(userAgent) ? "Windows" :
      /Android/.test(userAgent) ? "Android" :
      /iPhone|iPad/.test(userAgent) ? "iOS" :
      /Mac OS/.test(userAgent) ? "macOS" :
      /Linux/.test(userAgent) ? "Linux" :
      "Other";

    // 7. Read Vercel geolocation headers
    const vercelCity =
      request.headers.get("x-vercel-ip-city");

    const vercelCountry =
      request.headers.get("x-vercel-ip-country");

    const vercelRegion =
      request.headers.get("x-vercel-ip-country-region");

    const vercelLatitude =
      request.headers.get("x-vercel-ip-latitude");

    const vercelLongitude =
      request.headers.get("x-vercel-ip-longitude");

    const vercelTimezone =
      request.headers.get("x-vercel-ip-timezone");

    const vercelPostal =
      request.headers.get("x-vercel-ip-postal-code");

    // 8. Initialize location
    let location = {
      country: null as string | null,
      country_code: vercelCountry,
      region: vercelRegion,
      city: null as string | null,
      isp: null as string | null,
      asn: null as string | null,
      postal: vercelPostal,
      timezone: vercelTimezone,
      latitude: vercelLatitude
        ? Number(vercelLatitude) : null,
      longitude: vercelLongitude
        ? Number(vercelLongitude) : null
    };

    // Decode Vercel city header
    try {
      location.city = vercelCity
        ? decodeURIComponent(vercelCity)
        : null;
    } catch {
      location.city = vercelCity;
    }

    let geoStatus = "vercel_headers";

    // 9. IP lookup for additional information
    try {
      const response = await fetch(
        `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
        {
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
          headers: {
            Accept: "application/json"
          }
        }
      );

      const responseText = await response.text();

      console.log("IP API status:", response.status);

      if (response.ok) {
        const data = JSON.parse(responseText);

        console.log("IP API response:", data);

        if (!data.error) {
          location = {
            country: data.country_name || null,
            country_code:
              location.country_code ||
              data.country_code || null,
            region:
              location.region ||
              data.region || null,
            city:
              location.city ||
              data.city || null,
            isp: data.org || null,
            asn: data.asn || null,
            postal:
              location.postal ||
              data.postal || null,
            timezone:
              location.timezone ||
              data.timezone || null,
            latitude:
              location.latitude ??
              data.latitude ?? null,
            longitude:
              location.longitude ??
              data.longitude ?? null
          };

          geoStatus = "success";
        } else {
          console.error(
            "IP lookup error:",
            data.reason || data.error
          );
        }
      } else {
        console.error(
          "IP API HTTP error:",
          response.status,
          responseText
        );
      }
    } catch (error) {
      console.error(
        "IP lookup failed:",
        error
      );
    }

    // 10. Save visitor information
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
      console.error(
        "Supabase database error:",
        error
      );

      return NextResponse.json(
        { message: "Database error." },
        { status: 500 }
      );
    }

    // 11. Return result
    return NextResponse.json({
      success: true,
      message: "Visitor information recorded successfully!",
      ip,
      geolocation_status: geoStatus,
      location
    });

  } catch (error) {
    console.error(
      "Visitor tracking error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message: "Something went wrong."
      },
      { status: 500 }
    );
  }
}
