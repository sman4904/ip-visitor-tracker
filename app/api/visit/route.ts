
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Check visitor consent
    if (body.consent !== true) {
      return NextResponse.json(
        { message: "Consent is required." },
        { status: 400 }
      );
    }

    // Connect to Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    );

    // Get visitor IP from Vercel request headers
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

    const userAgent = request.headers.get("user-agent") || "";

    // Detect browser
    const browser =
      /Edg\//.test(userAgent) ? "Edge" :
      /Firefox\//.test(userAgent) ? "Firefox" :
      /Chrome\//.test(userAgent) ? "Chrome" :
      /Safari\//.test(userAgent) ? "Safari" : "Other";

    // Detect operating system
    const os =
      /Windows/.test(userAgent) ? "Windows" :
      /Android/.test(userAgent) ? "Android" :
      /iPhone|iPad/.test(userAgent) ? "iOS" :
      /Mac OS/.test(userAgent) ? "macOS" :
      /Linux/.test(userAgent) ? "Linux" : "Other";

    // Get approximate location
    let location = {
      country: null as string | null,
      region: null as string | null,
      city: null as string | null,
      isp: null as string | null
    };

    try {
      const response = await fetch(
        `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (response.ok) {
        const data = await response.json();

        if (!data.error) {
          location = {
            country: data.country_name || null,
            region: data.region || null,
            city: data.city || null,
            isp: data.org || null
          };
        }
      }
    } catch {
      console.log("Location lookup unavailable.");
    }

    // Save visitor information
    const { error } = await supabase
      .from("visitors")
      .insert({
        ip_address: ip,
        country: location.country,
        region: location.region,
        city: location.city,
        isp: location.isp,
        browser,
        operating_system: os,
        user_agent: userAgent
      });

    if (error) {
      console.error(error);

      return NextResponse.json(
        { message: "Database error." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Your visit was recorded successfully!"
    });

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { message: "Something went wrong." },
      { status: 500 }
    );
  }
}
