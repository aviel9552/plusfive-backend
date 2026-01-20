-- Verify categories table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'categories' 
ORDER BY ordinal_position;

-- Check if data exists
SELECT COUNT(*) as total_categories FROM categories;

-- Sample data with all columns
SELECT id, title, status, "isDeleted", "userId", "createdAt", "updatedAt" 
FROM categories 
LIMIT 5;
