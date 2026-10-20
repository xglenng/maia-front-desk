# Multi-artist studio scenario

Run `npm run staging:test:studio` after starting the isolated local staging app.
The endpoint-validating wrapper injects synthetic staging configuration with mock
providers and network restrictions. The script also requires the synthetic-testing
database marker. It creates an isolated studio with:

- Owner: studio-wide visibility and management.
- Alex: tattoo artist, automatic default, 120-minute/$300 service.
- Blair: piercer, automatic default, 30-minute/$60 service.
- Casey: apprentice test account using ARTIST permissions, Draft default,
  booking disabled, 180-minute/$100 service.

Each service has a 25% deposit policy. The same synthetic client has one WEB
conversation per artist. No real phone numbers, provider credentials, SMS sends,
calendar bookings, or payment collection are used. Fixtures remain for inspection;
temporary authentication sessions are removed after the test.

Verified October 19, 2026: 49 HTTP checks passed. Owner sees three conversations
and three usage profiles; each artist sees only their own. Other artists' records
and appointment queries are denied. Only the owner can manage service settings;
platform reporting remains denied. Prices/durations/deposit policy remain assigned
to the intended service/artist. A conversation override leaves other artists'
modes unchanged. The apprentice generates a private draft without an outbound
message. Booking disabled rejects an apprentice hold; two enabled artists can
hold the same start independently, with correct service/artist/price attribution.
Mixing another artist's service is rejected, and no payment records are created.
This validates stored deposit policy, not live deposit calculation or collection.

Supervision and dashboard switching now have expanded staging coverage. With
owner approval enabled for Casey, 77 HTTP checks verify forced draft mode,
blocking direct sends/payment/booking/mode bypasses, saving apprentice edits
privately, owner sending, stale/duplicate approval rejection, and authorized
dashboard selection. `docs/ARTIST_SUPERVISION.md` describes policy boundaries.
A distinct apprentice role and delegated non-owner supervisors are not included.
Shared-phone/social routing still needs separate integration validation.

Use `npm run staging:test:artists` for existing cross-organization and unauthorized
hold checks. Production is unaffected by these scripts.
