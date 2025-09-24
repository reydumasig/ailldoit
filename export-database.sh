#!/bin/bash

# Export database from Neon
echo "📊 Exporting database from Neon..."

# Get database URL
read -p "Enter your Neon DATABASE_URL: " DATABASE_URL

# Export database
pg_dump $DATABASE_URL > ailldoit-backup.sql

echo "✅ Database exported to ailldoit-backup.sql"
echo "📝 You can now import this to Cloud SQL"
