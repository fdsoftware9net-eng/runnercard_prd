-- Add new columns to runners table
-- This script adds top50, colour_sign, and qr columns

-- Add top50 column (stores TOP 50 information)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'runners' AND column_name = 'top50'
    ) THEN
        ALTER TABLE runners ADD COLUMN top50 TEXT;
    END IF;
END $$;

-- Add colour_sign column (stores color sign information)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'runners' AND column_name = 'colour_sign'
    ) THEN
        ALTER TABLE runners ADD COLUMN colour_sign TEXT;
    END IF;
END $$;

-- Add qr column (stores QR code URL)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'runners' AND column_name = 'qr'
    ) THEN
        ALTER TABLE runners ADD COLUMN qr TEXT;
    END IF;
END $$;

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'runners' 
AND column_name IN ('top50', 'colour_sign', 'qr')
ORDER BY column_name;
