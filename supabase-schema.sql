-- Rodar no SQL Editor do Supabase Dashboard

CREATE TABLE signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_path TEXT NOT NULL,
  image_url TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('draw', 'photo')),
  device_id TEXT NOT NULL,
  password TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_signatures_name_lower ON signatures (LOWER(name));
CREATE INDEX idx_signatures_device_id ON signatures (device_id);

-- Criar bucket público no Storage (fazer manualmente pelo Dashboard ou via SQL)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('signatures', 'signatures', true);
-- Depois ir em Storage > Policies > New Policy > Allow public select
