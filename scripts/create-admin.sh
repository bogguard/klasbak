#!/usr/bin/env bash
# Creates an administrator account for the app, with a random temporary password that is shown
# once (nothing typed on the command line, so nothing in the shell history). At the first
# sign-in the app asks for a new password and sets up two-step verification. Further staff
# accounts are made in the app itself (Beheer → Medewerkers).
# Usage: scripts/create-admin.sh dev|prod <username> <email>
set -euo pipefail
# AWS CLI v2 shows some output in a pager (less), which waits for 'q'; scripts must not stop.
export AWS_PAGER=""

env="${1:?usage: scripts/create-admin.sh dev|prod <username> <email>}"
username="${2:?usage: scripts/create-admin.sh dev|prod <username> <email>}"
email="${3:?usage: scripts/create-admin.sh dev|prod <username> <email>}"
region="eu-west-1"
stack="klasbak-${env}"

if ! account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "Not signed in to AWS. Run first: export AWS_PROFILE=<your profile>  (and aws sso login if needed)" >&2
  exit 1
fi

pool="$(aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text 2>/dev/null || true)"
if [[ -z "$pool" || "$pool" == "None" ]]; then
  echo "No stack ${stack} in account ${account}. Deploy first: npm run deploy:${env}" >&2
  exit 1
fi

# 16 characters from an alphabet without look-alikes (0/O, 1/l/I): easy to pass on.
# No `tr </dev/urandom | head`: head closes the pipe, tr dies of SIGPIPE and pipefail stops the
# script without a word. 4 KB of random bytes leave about 850 usable characters.
password="$(head -c 4096 /dev/urandom | LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789')"
password="${password:0:16}"

aws cognito-idp admin-create-user --region "$region" --user-pool-id "$pool" \
  --username "$username" --temporary-password "$password" --message-action SUPPRESS \
  --user-attributes Name=email,Value="$email" Name=email_verified,Value=true >/dev/null
aws cognito-idp admin-add-user-to-group --region "$region" --user-pool-id "$pool" \
  --username "$username" --group-name admin

url="$(aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
  --query "Stacks[0].Outputs[?OutputKey=='AppUrl'].OutputValue" --output text)"

cat <<DONE

Administrator created in account ${account} (${stack}):
  Address:             ${url}
  Username:            ${username}
  Temporary password:  ${password}   (valid 14 days, shown only now)

Pass these on in person or by phone, not in the same email.
DONE
