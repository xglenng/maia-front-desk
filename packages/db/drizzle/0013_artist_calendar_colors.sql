ALTER TABLE "artists" ADD COLUMN "calendar_color" text;
ALTER TABLE "artists" ADD CONSTRAINT "artists_calendar_color_check" CHECK ("calendar_color" IS NULL OR "calendar_color" IN ('#006AFF','#008A42','#C66B00','#8053C4','#C73564','#007F86','#B83C30','#596579'));
-- Assign legacy profiles a stable studio palette without changing roles or access.
WITH ranked AS (
  SELECT id, ((row_number() OVER (PARTITION BY organization_id ORDER BY display_name,id)-1) % 8)::int AS position
  FROM artists
)
UPDATE artists a SET calendar_color=(ARRAY['#006AFF','#008A42','#C66B00','#8053C4','#C73564','#007F86','#B83C30','#596579'])[r.position+1]
FROM ranked r WHERE a.id=r.id AND a.calendar_color IS NULL;
