#!/usr/bin/env bash
# Builds the product site and publishes it: the CloudFormation stack (bucket, CloudFront,
# headers), then the pages. Safe to run again. Usage, signed in to the right AWS account:
#   export AWS_PROFILE=<profile>; site/deploy.sh
set -euo pipefail
export AWS_PAGER=""
cd "$(dirname "$0")/.."

stack="library-site"
region="eu-west-1"
prefix="/library-site"

if ! account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "Not signed in to AWS. Run first: export AWS_PROFILE=<your profile>  (and aws sso login if needed)" >&2
  exit 1
fi
echo "AWS account ${account} (profile: ${AWS_PROFILE:-default}), stack ${stack}"

# The web address and certificate are set by scripts/request-certificate.sh <domain> ${prefix};
# until then the site runs on its CloudFront address.
for name in domain-name certificate-arn; do
  if ! aws ssm get-parameter --region "$region" --name "${prefix}/${name}" >/dev/null 2>&1; then
    aws ssm put-parameter --region "$region" --name "${prefix}/${name}" --type String --value none >/dev/null
  fi
done

node site/build.mjs

aws cloudformation deploy --region "$region" --stack-name "$stack" \
  --template-file site/template.yaml --no-fail-on-empty-changeset \
  --tags project=library-site

output() {
  aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
bucket="$(output BucketName)"
distribution="$(output DistributionId)"

# Assets have a content hash in their name: cache them for a year. Pages change in place:
# browsers and CloudFront check again after five minutes.
aws s3 sync site/dist/assets "s3://${bucket}/assets" --region "$region" --delete \
  --cache-control "public, max-age=31536000, immutable" --only-show-errors
aws s3 sync site/dist "s3://${bucket}" --region "$region" --delete --exclude "assets/*" \
  --cache-control "public, max-age=300" --only-show-errors
aws cloudfront create-invalidation --distribution-id "$distribution" --paths "/*" \
  --query Invalidation.Id --output text >/dev/null

cat <<DONE

Published: $(output SiteUrl)
CloudFront address: $(output CloudFrontDomain)
DONE
if [[ "$(aws ssm get-parameter --region "$region" --name "${prefix}/domain-name" --query Parameter.Value --output text)" != none ]]; then
  echo "DNS: the site's address needs a CNAME to the CloudFront address above (once)."
fi
