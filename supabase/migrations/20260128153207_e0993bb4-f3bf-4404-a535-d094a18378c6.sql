-- Create public bucket for client photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-photos', 'client-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create policies for client photos bucket
CREATE POLICY "Client photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-photos');

CREATE POLICY "Authenticated users can upload client photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'client-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update client photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'client-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete client photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'client-photos' AND auth.role() = 'authenticated');