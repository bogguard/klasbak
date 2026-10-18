#!/usr/bin/env bash
# Stores the settings an installation needs in this AWS account's Parameter Store, before the
# first deploy. They stay out of git. Safe to run again: an own web address set up earlier is
# kept. Usage: scripts/setup-installation.sh <email for alarms>
#   Optional: GOOGLE_BOOKS_API_KEY=<key> scripts/setup-installation.sh <email>
set -euo pipefail
# AWS CLI v2 shows some output in a pager (less), which waits for 'q'; scripts must not stop.
export AWS_PAGER=""

email="${1:?usage: scripts/setup-installation.sh <email address that receives alarms>}"
region="eu-west-1"

if ! account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "Not signed in to AWS. Run first: export AWS_PROFILE=<your profile>  (and aws sso login if needed)" >&2
  exit 1
fi
echo "AWS account ${account} (profile: ${AWS_PROFILE:-default}), region ${region}"

put() { aws ssm put-parameter --region "$region" --name "$1" --type "$2" --value "$3" --overwrite >/dev/null; }
exists() { aws ssm get-parameter --region "$region" --name "$1" >/dev/null 2>&1; }

put /library/alarm-email String "$email"
echo "  alarms go to ${email}"

# Without an own web address the library runs on its CloudFront address (d1234.cloudfront.net).
# "none" means exactly that; scripts/request-certificate.sh replaces it later.
for name in domain-name certificate-arn; do
  if exists "/library/${name}"; then
    echo "  /library/${name} already set: $(aws ssm get-parameter --region "$region" --name "/library/${name}" --query Parameter.Value --output text)"
  else
    put "/library/${name}" String none
    echo "  /library/${name} = none (no own web address yet)"
  fi
done

if [[ -n "${GOOGLE_BOOKS_API_KEY:-}" ]]; then
  put /library/google-books-api-key SecureString "$GOOGLE_BOOKS_API_KEY"
  echo "  Google Books API key stored (encrypted)"
fi

cat <<NEXT

Settings stored. Next:
  npm run deploy:prod          (or deploy:dev for a test account)
  scripts/deploy-web.sh prod
  scripts/create-admin.sh prod <username> <email>
NEXT
