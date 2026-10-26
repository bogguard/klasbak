#!/usr/bin/env bash
# Stores the settings an installation needs in this AWS account's Parameter Store, before the
# first deploy. They stay out of git. Safe to run again: an own web address set up earlier is
# kept. Usage: scripts/setup-installation.sh <email for alarms> <instellingsnummer>
#   Optional: GOOGLE_BOOKS_API_KEY=<key> scripts/setup-installation.sh <email> <instellingsnummer>
set -euo pipefail
# AWS CLI v2 shows some output in a pager (less), which waits for 'q'; scripts must not stop.
export AWS_PAGER=""

usage="usage: scripts/setup-installation.sh <email address that receives alarms> <instellingsnummer>"
email="${1:?$usage}"
institution_number="${2:?$usage}"
if [[ ! "$institution_number" =~ ^[0-9]{6}$ ]]; then
  echo "The instellingsnummer has six digits (the school's number at the Departement Onderwijs)." >&2
  exit 1
fi
region="eu-west-1"

if ! account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "Not signed in to AWS. Run first: export AWS_PROFILE=<your profile>  (and aws sso login if needed)" >&2
  exit 1
fi
echo "AWS account ${account} (profile: ${AWS_PROFILE:-default}), region ${region}"

put() { aws ssm put-parameter --region "$region" --name "$1" --type "$2" --value "$3" --overwrite >/dev/null; }
exists() { aws ssm get-parameter --region "$region" --name "$1" >/dev/null 2>&1; }

put /klasbak/alarm-email String "$email"
echo "  alarms go to ${email}"

# Every barcode and card number starts with it (decision 038), so it can't change once labels
# are printed. Changing it on purpose (nothing printed yet): aws ssm put-parameter --overwrite.
if exists /klasbak/institution-number; then
  current="$(aws ssm get-parameter --region "$region" --name /klasbak/institution-number --query Parameter.Value --output text)"
  if [[ "$current" != "$institution_number" ]]; then
    echo "This installation already has instellingsnummer ${current}; printed labels and cards start with it." >&2
    exit 1
  fi
else
  put /klasbak/institution-number String "$institution_number"
fi
echo "  instellingsnummer ${institution_number} (start of every barcode and card number)"

# Without an own web address the app runs on its CloudFront address (d1234.cloudfront.net).
# "none" means exactly that; scripts/request-certificate.sh replaces it later.
for name in domain-name certificate-arn; do
  if exists "/klasbak/${name}"; then
    echo "  /klasbak/${name} already set: $(aws ssm get-parameter --region "$region" --name "/klasbak/${name}" --query Parameter.Value --output text)"
  else
    put "/klasbak/${name}" String none
    echo "  /klasbak/${name} = none (no own web address yet)"
  fi
done

if [[ -n "${GOOGLE_BOOKS_API_KEY:-}" ]]; then
  put /klasbak/google-books-api-key SecureString "$GOOGLE_BOOKS_API_KEY"
  echo "  Google Books API key stored (encrypted)"
fi

cat <<NEXT

Settings stored. Next (dev for a test account, prod for a school):
  npm run deploy:prod
  scripts/deploy-web.sh prod
  scripts/create-admin.sh prod <username> <email>
NEXT
