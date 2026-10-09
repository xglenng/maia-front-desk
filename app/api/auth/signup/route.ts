import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/packages/db/src";
import { cookieName, sameOrigin } from "@/packages/auth/server";
import { digest, hashPassword, token } from "@/packages/auth/crypto";
import { isSignupRateLimited } from "@/packages/auth/signup-rate-limit";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function validTimezone(value: string) {
  if (value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const duplicateAccountResponse = () => NextResponse.json(
  { error: "An account with these details already exists." },
  { status: 409 }
);

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 }
    );
  }

  let client;

  try {
    if (await isSignupRateLimited(req)) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Please check your signup information." }, { status: 400 });
    }

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
      password.length > 128 ||
      (body.timezone !== undefined && typeof body.timezone !== "string") ||
      !validTimezone(timezone)
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

    // Serialize matching signup identities even before the unique index is
    // deployed. The index remains necessary for writes outside this route.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`signup-email:${email}`]);
    const existingIdentity = await client.query(
      "SELECT id FROM users WHERE lower(btrim(email))=$1 LIMIT 1",
      [email]
    );
    if (existingIdentity.rowCount) {
      await client.query("ROLLBACK");
      return duplicateAccountResponse();
    }

    // Owners may independently choose the same studio name. Serialize slug
    // allocation so both signups succeed with distinct public URLs.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`signup-slug:${baseSlug}`]);

    // Generate a unique organization slug.
    let slug = baseSlug;
    let suffix = 1;

    let organization;
    while (true) {
      const organizationResult = await client.query(
        `INSERT INTO organizations(name, slug, timezone, public_name)
         VALUES($1, $2, $3, $1)
         ON CONFLICT (slug) DO NOTHING
         RETURNING id, name, slug`,
        [studioName, slug, timezone]
      );
      if (organizationResult.rowCount) {
        organization = organizationResult.rows[0];
        break;
      }
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

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
  } catch (error: unknown) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }

    const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
    if (code === "23505") {
      return duplicateAccountResponse();
    }

    if (error instanceof SyntaxError) return NextResponse.json({ error: "Please check your signup information." }, { status: 400 });
    console.error("Signup failed", { errorType: error instanceof Error ? error.name : "UnknownError", code });

    return NextResponse.json(
      { error: "Unable to create studio." },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}
