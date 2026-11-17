-- Allow waiver submissions for anonymous walk-ins without requiring a client_id
-- Walk-in waiver signers can provide their details during form signing
ALTER TABLE "waiver_submissions" ALTER COLUMN "client_id" DROP NOT NULL;
