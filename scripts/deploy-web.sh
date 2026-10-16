#!/usr/bin/env bash
# Builds the frontend and publishes it to the stack's web bucket.
# Usage: scripts/deploy-web.sh dev|prod [library name]
set -euo pipefail

env="${1:?usage: deploy-web.sh dev|prod [library name]}"
library_name="${2:-Bibliotheek}"
stack="library-${env}"
region="eu-west-1"

output() {
  aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

bucket="$(output WebBucketName)"
distribution="$(output DistributionId)"

npm run build -w apps/web

# Runtime config: one build works for every environment and school.
cat > apps/web/dist/config.json <<EOF
{
  "libraryName": "${library_name}",
  "region": "${region}",
  "userPoolId": "$(output UserPoolId)",
  "userPoolClientId": "$(output UserPoolClientId)"
}
EOF

# Hashed assets never change, so browsers may cache them for a year.
aws s3 sync apps/web/dist/assets "s3://${bucket}/assets" --region "$region" \
  --cache-control "public, max-age=31536000, immutable" --delete --exclude "*.wasm"
# WebAssembly (camera barcode reader) needs its exact media type to start efficiently.
aws s3 cp apps/web/dist/assets "s3://${bucket}/assets" --region "$region" --recursive \
  --exclude "*" --include "*.wasm" --content-type application/wasm \
  --cache-control "public, max-age=31536000, immutable"

# Everything else must be revalidated so new releases show up immediately.
# --delete is safe here only because covers/, search/ and branding/ are excluded: the API writes them.
aws s3 sync apps/web/dist "s3://${bucket}" --region "$region" \
  --cache-control "no-cache" --delete \
  --exclude "assets/*" --exclude "covers/*" --exclude "search/*" --exclude "branding/*"

aws cloudfront create-invalidation --distribution-id "$distribution" \
  --paths "/index.html" "/config.json" --query "Invalidation.Id" --output text

echo "Deployed to $(output AppUrl)"
