-- Allow waivers for anonymous walk-ins without requiring a client_id
-- Walk-in waivers can collect signer details during the form submission
ALTER TABLE "external_waiver_assignments" ALTER COLUMN "client_id" DROP NOT NULL;
