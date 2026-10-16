#!/usr/bin/env bash
# Gets a free certificate for the school's own web address (e.g. bib.school.be) and stores
# the settings for the next deploy. Safe to run again: it picks up where it left off.
# Usage: scripts/request-certificate.sh bib.school.be
set -euo pipefail

domain="${1:?usage: scripts/request-certificate.sh <web address, e.g. bib.school.be>}"
region="eu-west-1"       # where the library stack and its settings live
cert_region="us-east-1"  # CloudFront only accepts certificates from this region

# Reuse a certificate requested earlier for this address.
arn="$(aws acm list-certificates --region "$cert_region" \
  --certificate-statuses PENDING_VALIDATION ISSUED \
  --query "CertificateSummaryList[?DomainName=='${domain}'].CertificateArn | [0]" --output text)"
if [[ -z "$arn" || "$arn" == "None" ]]; then
  echo "Requesting a certificate for ${domain}…"
  arn="$(aws acm request-certificate --region "$cert_region" --domain-name "$domain" \
    --validation-method DNS --query CertificateArn --output text)"
fi

status="$(aws acm describe-certificate --region "$cert_region" --certificate-arn "$arn" \
  --query Certificate.Status --output text)"

if [[ "$status" != "ISSUED" ]]; then
  # The validation record appears a few seconds after the request.
  record="None"
  for _ in {1..10}; do
    record="$(aws acm describe-certificate --region "$cert_region" --certificate-arn "$arn" \
      --query 'Certificate.DomainValidationOptions[0].ResourceRecord.[Name,Value]' --output text)"
    [[ "$record" != "None" && -n "$record" ]] && break
    sleep 3
  done
  read -r name value <<<"$record"
  # AWS gives fully qualified names ending in a dot; most DNS panels (e.g. Antagonist,
  # Combell, one.com) reject that dot and want the name relative to the domain.
  name="${name%.}"
  value="${value%.}"
  zone="${domain#*.}"  # bib.school.be -> school.be
  short_name="${name%."$zone"}"
  cat <<INSTRUCTIONS

Step 1 of 2: ask whoever manages the school's domain (${zone}) to add this DNS record:

  Type:   CNAME
  Name:   ${short_name}
          (some DNS panels want the full name: ${name})
  Value:  ${value}

Enter both without a dot at the end.

It only proves the address belongs to the school; nothing changes for visitors yet.
Waiting until AWS sees the record (usually minutes, sometimes a few hours)…
If this window closes, just run this script again.

INSTRUCTIONS
  if ! aws acm wait certificate-validated --region "$cert_region" --certificate-arn "$arn"; then
    reason="$(aws acm describe-certificate --region "$cert_region" --certificate-arn "$arn" \
      --query Certificate.FailureReason --output text)"
    if [[ "$reason" == "CAA_ERROR" ]]; then
      cat <<CAA

The domain's CAA record doesn't allow Amazon to issue certificates. Add this DNS record to
${zone} (keep any existing CAA records, e.g. for Let's Encrypt), then run this script again:

  Type: CAA   Name: (the domain itself)   Flags: 0   Tag: issue   Value: amazon.com
CAA
    else
      echo "Validation stopped (${reason}). Check the DNS record above and run this script again."
    fi
    exit 1
  fi
fi

aws ssm put-parameter --region "$region" --name /library/domain-name --type String \
  --value "$domain" --overwrite >/dev/null
aws ssm put-parameter --region "$region" --name /library/certificate-arn --type String \
  --value "$arn" --overwrite >/dev/null

cat <<NEXT

Certificate ready and stored. Next:
  1. Deploy:  npm run deploy:dev   (or deploy:prod)
  2. Step 2 of 2: add a second DNS record at the school's domain:
       Type:   CNAME
       Name:   ${domain%%.*}   (or the full name ${domain}, depending on the DNS panel)
       Value:  the CloudFrontDomain output of the deploy (e.g. d1234abcd.cloudfront.net),
               without a dot at the end
  3. Publish the website again:  scripts/deploy-web.sh <env> "<library name>"
NEXT
