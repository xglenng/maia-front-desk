CREATE FUNCTION protect_signed_consent_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Signed consent evidence is retained and cannot be changed or deleted'
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER waiver_submissions_retention
BEFORE UPDATE OR DELETE OR TRUNCATE ON waiver_submissions
FOR EACH STATEMENT EXECUTE FUNCTION protect_signed_consent_evidence();
--> statement-breakpoint
CREATE TRIGGER waiver_identity_documents_retention
BEFORE UPDATE OR DELETE OR TRUNCATE ON waiver_identity_documents
FOR EACH STATEMENT EXECUTE FUNCTION protect_signed_consent_evidence();
--> statement-breakpoint
CREATE FUNCTION protect_signed_consent_template() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.name, NEW.body, NEW.version, NEW.organization_id, NEW.id)
       IS DISTINCT FROM (OLD.name, OLD.body, OLD.version, OLD.organization_id, OLD.id)
     AND EXISTS (SELECT 1 FROM waiver_submissions
                 WHERE waiver_template_id = OLD.id AND organization_id = OLD.organization_id) THEN
    RAISE EXCEPTION 'A template referenced by signed consent evidence cannot be changed'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER signed_consent_template_retention
BEFORE UPDATE ON waiver_templates
FOR EACH ROW EXECUTE FUNCTION protect_signed_consent_template();
--> statement-breakpoint
CREATE FUNCTION protect_studio_logo_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     (NEW.id, NEW.organization_id, NEW.content_type, NEW.byte_length, NEW.sha256, NEW.data, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.content_type, OLD.byte_length, OLD.sha256, OLD.data, OLD.created_at) THEN
    RAISE EXCEPTION 'Studio logo assets are retained for signed consent evidence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER studio_logo_evidence_retention
BEFORE UPDATE OR DELETE ON studio_logo_assets
FOR EACH ROW EXECUTE FUNCTION protect_studio_logo_evidence();
--> statement-breakpoint
CREATE TRIGGER studio_logo_truncate_retention
BEFORE TRUNCATE ON studio_logo_assets
FOR EACH STATEMENT EXECUTE FUNCTION protect_signed_consent_evidence();
