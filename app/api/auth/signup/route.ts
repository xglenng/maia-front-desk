import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/packages/db/src";
import { cookieName, sameOrigin } from "@/packages/auth/server";
import { digest, hashPassword, token } from "@/packages/auth/crypto";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 }
    );
  }

  let client;

  try {
    const body = await req.json();

    const studioName =
      typeof body.studioName === "string" ? body.studioName.trim() : "";

    const ownerName =
      typeof body.ownerName === "string" ? body.ownerName.trim() : "";

    const artistName =
      typeof body.artistName === "string" ? body.artistName.trim() : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    const timezone =
      typeof body.timezone === "string" && body.timezone.trim()
        ? body.timezone.trim()
        : "America/Denver";

    if (
      studioName.length < 2 ||
      studioName.length > 120 ||
      ownerName.length < 2 ||
      ownerName.length > 120 ||
      artistName.length < 2 ||
      artistName.length > 120 ||
      email.length < 3 ||
      email.length > 254 ||
      !email.includes("@") ||
      password.length < 10 ||
      password.length > 128
    ) {
      return NextResponse.json(
        { error: "Please check your signup information." },
        { status: 400 }
      );
    }

    const baseSlug = slugify(studioName);

    if (!baseSlug) {
      return NextResponse.json(
        { error: "Please enter a valid studio name." },
        { status: 400 }
      );
    }

    client = await pool.connect();
    await client.query("BEGIN");

    // Generate a unique organization slug.
    let slug = baseSlug;
    let suffix = 1;

    while (true) {
      const existing = await client.query(
        "SELECT id FROM organizations WHERE slug=$1 LIMIT 1",
        [slug]
      );

      if (!existing.rowCount) break;

      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const organizationResult = await client.query(
      `INSERT INTO organizations(name, slug, timezone)
       VALUES($1, $2, $3)
       RETURNING id, name, slug`,
      [studioName, slug, timezone]
    );

    const organization = organizationResult.rows[0];

    const userResult = await client.query(
      `INSERT INTO users(organization_id, email, name, role)
       VALUES($1, $2, $3, 'OWNER')
       RETURNING id`,
      [organization.id, email, ownerName]
    );

    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO auth_credentials(user_id, password_hash, active)
       VALUES($1, $2, true)`,
      [user.id, hashPassword(password)]
    );

    const artistResult = await client.query(
      `INSERT INTO artists(
         organization_id,
         user_id,
         display_name,
         ai_mode
       )
       VALUES($1, $2, $3, 'ASSISTED')
       RETURNING id, display_name`,
      [organization.id, user.id, artistName]
    );

    const artist = artistResult.rows[0];

    const rawToken = token();

    await client.query(
      `INSERT INTO auth_sessions(token_hash, user_id, expires_at)
       VALUES($1, $2, now() + interval '7 days')`,
      [digest(rawToken), user.id]
    );

    await client.query("COMMIT");

    const response = NextResponse.json(
      {
        ok: true,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        artistId: artist.id
      },
      { status: 201 }
    );

    response.cookies.set(cookieName, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 604800
    });

    return response;
  } catch (error: any) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    console.error("Signup failed:", error);

    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "An account with these details already exists." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Unable to create studio." },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}