-- Saved trips get an edit token (docs/04, Growth G4 step A7): the sha256 of a token returned once
-- when the trip is saved. Additive: a new nullable column; trips saved before it stay read only.
ALTER TABLE "trip" ADD COLUMN "edit_token_hash" text;
