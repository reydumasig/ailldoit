#!/bin/bash
echo "🔍 Checking Cloud Run logs for campaign generation..."
echo ""
echo "Run this command to check logs:"
echo "gcloud run services logs read ailldoit-staging --region us-central1 --limit 500 | grep -E 'ROUTE DEBUG|Campaign Type|Generating|VIDEO PROCESSING|audio' | tail -50"
echo ""
echo "Or to see all recent logs:"
echo "gcloud run services logs read ailldoit-staging --region us-central1 --limit 200"
