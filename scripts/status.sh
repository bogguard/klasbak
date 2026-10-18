#!/usr/bin/env bash
# How is the library doing? Alarms, traffic and errors of the last 24 hours, the nightly job,
# costs, and the latest errors and warnings from the logs. Read-only: changes nothing.
# Exits with 1 when an alarm is on, so it can also run from a scheduled job.
# Usage: scripts/status.sh dev|prod
set -euo pipefail
# AWS CLI v2 shows some output in a pager (less), which waits for 'q'; scripts must not stop.
export AWS_PAGER=""

env="${1:?usage: scripts/status.sh dev|prod}"
region="eu-west-1"
stack="library-${env}"

if ! account="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  echo "Not signed in to AWS. Run first: export AWS_PROFILE=<your profile>  (and aws sso login if needed)" >&2
  exit 1
fi

output() {
  aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
resources() {
  aws cloudformation describe-stack-resources --region "$region" --stack-name "$stack" \
    --query "StackResources[?ResourceType=='$1'].[LogicalResourceId,PhysicalResourceId]" --output text
}
# macOS and Linux spell "24 hours ago" differently.
ago() { date -u -v-"$1"H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "$1 hours ago" +%Y-%m-%dT%H:%M:%SZ; }
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
day="$(ago 24)"
sum() { # namespace metric dimensions... -> total over the last 24 hours
  local namespace="$1" metric="$2"; shift 2
  local value
  value="$(aws cloudwatch get-metric-statistics --region "$region" --namespace "$namespace" \
    --metric-name "$metric" --start-time "$day" --end-time "$now" --period 86400 \
    --statistics Sum ${1:+--dimensions "$@"} --query 'Datapoints[0].Sum' --output text)"
  [[ "$value" == "None" ]] && value=0
  printf '%.0f' "$value"
}

echo "Library ${env} — account ${account} — $(date '+%a %d %b %Y %H:%M')"
echo "  App:       $(output AppUrl)"
echo "  Dashboard: $(output DashboardUrl)"

echo
echo "Alarms"
alarms="$(aws cloudwatch describe-alarms --region "$region" --alarm-name-prefix "${stack}-" \
  --query 'MetricAlarms[].[StateValue,AlarmDescription]' --output text)"
firing=0
waiting=0
while IFS=$'\t' read -r state description; do
  [[ -z "$state" ]] && continue
  case "$state" in
    OK) mark="ok   " ;;
    ALARM) mark="ALARM"; firing=1 ;;
    *) mark="new  "; waiting=1 ;; # INSUFFICIENT_DATA: too little data yet (e.g. just deployed)
  esac
  echo "  ${mark} ${description}"
done <<<"$alarms"

api="$(resources AWS::ApiGatewayV2::Api | awk '{print $2}')"
# HTTP APIs report their metrics under the stage literally named "$default".
# shellcheck disable=SC2016
stage='$default'
echo
echo "Last 24 hours"
echo "  API requests:          $(sum AWS/ApiGateway Count Name=ApiId,Value="$api" Name=Stage,Value="$stage")"
echo "  Refused (4xx):         $(sum AWS/ApiGateway 4xx Name=ApiId,Value="$api" Name=Stage,Value="$stage")   (validation, expired sign-ins: normal in small numbers)"
echo "  Server errors (5xx):   $(sum AWS/ApiGateway 5xx Name=ApiId,Value="$api" Name=Stage,Value="$stage")"
while read -r logical physical; do
  [[ -z "$physical" || "$logical" == "SpaRewriteFunction" ]] && continue
  errors="$(sum AWS/Lambda Errors Name=FunctionName,Value="$physical")"
  [[ "$errors" != "0" ]] && echo "  Errors in ${logical}: ${errors}"
done < <(resources AWS::Serverless::Function; resources AWS::Lambda::Function)
echo "  Throttled:             $(sum AWS/Lambda Throttles)"
echo "  Loans:                 $(aws cloudwatch get-metric-statistics --region "$region" --namespace Library \
  --metric-name LoanCreated --dimensions Name=service,Value=library --start-time "$day" --end-time "$now" \
  --period 86400 --statistics Sum --query 'Datapoints[0].Sum' --output text | sed 's/None/0/; s/\.0$//')"

retention="$(resources AWS::Lambda::Function | awk '$1=="RetentionFunction"{print $2}')"
if [[ -n "$retention" ]]; then
  runs="$(aws cloudwatch get-metric-statistics --region "$region" --namespace AWS/Lambda \
    --metric-name Invocations --dimensions Name=FunctionName,Value="$retention" \
    --start-time "$(ago 48)" --end-time "$now" --period 172800 --statistics Sum \
    --query 'Datapoints[0].Sum' --output text | sed 's/None/0/; s/\.0$//')"
  echo "  Nightly history clean-up, last 48 h: ${runs} run(s)"
fi

if [[ "$env" == "prod" ]]; then
  budget="$(aws budgets describe-budgets --account-id "$account" --region us-east-1 \
    --query "Budgets[?starts_with(BudgetName, '${stack}')].[CalculatedSpend.ActualSpend.Amount,BudgetLimit.Amount] | [0]" \
    --output text 2>/dev/null || true)"
  [[ -n "$budget" && "$budget" != "None" ]] && echo "  Costs this month:      \$$(awk '{printf "%.2f of %.0f", $1, $2}' <<<"$budget")"
fi

echo
echo "Latest errors and warnings (24 h)"
groups=()
while read -r logical physical; do
  [[ "$logical" == "ApiAccessLogGroup" || -z "$physical" ]] && continue
  groups+=("$physical")
done < <(resources AWS::Logs::LogGroup)
query_id="$(aws logs start-query --region "$region" --log-group-names "${groups[@]}" \
  --start-time "$(date -u -j -f %Y-%m-%dT%H:%M:%SZ "$day" +%s 2>/dev/null || date -u -d "$day" +%s)" \
  --end-time "$(date -u +%s)" \
  --query-string "fields @timestamp, level, message, error.message, function_request_id | filter level in ['ERROR', 'WARN'] | sort @timestamp desc | limit 10" \
  --query queryId --output text)"
for _ in {1..20}; do
  result="$(aws logs get-query-results --region "$region" --query-id "$query_id" --output json)"
  [[ "$(jq -r .status <<<"$result")" == "Complete" ]] && break
  sleep 1
done
lines="$(jq -r '.results[] | map({(.field): .value}) | add
  | "  \(.["@timestamp"][0:16])  \(.level)  \(.message)\(if .["error.message"] then ": " + .["error.message"] else "" end)  [ref \(.function_request_id[0:8])]"' <<<"$result")"
echo "${lines:-  none}"

echo
[[ "$waiting" == 1 ]] && echo "\"new\": the alarm has too little data yet (e.g. just deployed); it turns ok by itself."
if [[ "$firing" == 1 ]]; then
  echo "An alarm is on: see docs/runbook.md for what it means and what to do."
  exit 1
fi
echo "All quiet."
