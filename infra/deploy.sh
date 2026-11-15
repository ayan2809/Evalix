#!/usr/bin/env bash
# Deploy Evalix to AWS (ap-south-1). See infra/README.md.
#   infra/deploy.sh [all|backend|frontend|status|wake|stop]
#     all       storage stack, engine code, front desk, app stack, web app, smoke check (default)
#     backend   everything except the web app
#     frontend  build the web app, upload it, clear the CloudFront cache
#     status    the address and whether the run engine is on
#     wake      switch the run engine on      stop   switch it off
# Env: EVALIX_ALERT_EMAIL=you@example.com (optional: a $5/month AWS Budgets alert)
# Needs the keys in SSM first: uv run --project backend python infra/push_secrets.py
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export AWS_REGION="${AWS_REGION:-ap-south-1}" AWS_DEFAULT_REGION="${AWS_REGION:-ap-south-1}"
export COPYFILE_DISABLE=1  # no macOS ._ files in the tarball
WHAT="${1:-all}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
DATA="evalix-data-$ACCOUNT"
WEB="evalix-web-$ACCOUNT"
step() { printf '\n==> %s\n' "$*"; }
stack_exists() { aws cloudformation describe-stacks --stack-name "$1" >/dev/null 2>&1; }
out() {
  aws cloudformation describe-stacks --stack-name evalix \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
param() {  # a parameter the app stack was last deployed with
  aws cloudformation describe-stacks --stack-name evalix \
    --query "Stacks[0].Parameters[?ParameterKey=='$1'].ParameterValue" --output text
}
engine_state() {
  aws ec2 describe-instances --instance-ids "$(out EngineInstanceId)" \
    --query 'Reservations[0].Instances[0].State.Name' --output text
}

deploy_storage() {
  step "storage stack (data + web buckets)"
  aws cloudformation deploy --stack-name evalix-storage --template-file infra/storage.yaml \
    --no-fail-on-empty-changeset
}

check_secrets() {
  step "keys in SSM (names only)"
  uv run --quiet --project backend python infra/push_secrets.py --check
}

upload_engine() {
  step "run engine code → s3://$DATA/artifacts/engine/"
  local tarball="$ROOT/build/evalix-engine.tar.gz"
  mkdir -p build
  tar czf "$tarball" --no-mac-metadata \
    --exclude '.venv' --exclude '__pycache__' --exclude '*.pyc' --exclude '*.db' --exclude '*.db-*' \
    --exclude '.pytest_cache' --exclude 'backend/tests' \
    backend/app backend/data backend/pyproject.toml backend/uv.lock \
    agents bifrost/config.json infra/engine
  aws s3 cp --only-show-errors "$tarball" "s3://$DATA/artifacts/engine/release.tar.gz"
  aws s3 cp --only-show-errors infra/engine/bootstrap.sh "s3://$DATA/artifacts/engine/bootstrap.sh"
  aws s3 cp --only-show-errors infra/engine/evalix-update "s3://$DATA/artifacts/engine/evalix-update"
  echo "engine code: $(du -h "$tarball" | cut -f1)"
}

deploy_app() {
  step "front desk zip"
  local zip sha key secret ami vpc subnet
  zip="$(infra/build_desk_zip.sh)"
  sha="$(git rev-parse --short HEAD)"
  git diff --quiet HEAD -- backend || sha="$sha-dirty-$(date +%s)"
  key="artifacts/desk/$sha.zip"
  aws s3 cp --only-show-errors "$zip" "s3://$DATA/$key"

  secret="$(aws ssm get-parameter --name /evalix/EVALIX_ORIGIN_SECRET --with-decryption \
    --query Parameter.Value --output text)"
  local first=1
  if stack_exists evalix; then
    first=0
    # Keep the engine's image and place: changing either would replace the engine and its disk.
    ami="$(param EngineAmiId)"; vpc="$(param VpcId)"; subnet="$(param SubnetId)"
  else
    ami="$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 \
      --query Parameter.Value --output text)"
    vpc="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
    subnet="$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$vpc" Name=default-for-az,Values=true \
      Name=availability-zone,Values="${AWS_REGION}a" --query 'Subnets[0].SubnetId' --output text)"
  fi

  step "app stack (engine, front desk, CloudFront, nightly stop)"
  aws cloudformation deploy --stack-name evalix --template-file infra/evalix.yaml \
    --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset \
    --parameter-overrides "DeskCodeKey=$key" "OriginSecret=$secret" "EngineAmiId=$ami" \
    "VpcId=$vpc" "SubnetId=$subnet" "AlertEmail=${EVALIX_ALERT_EMAIL:-}"

  if [ "$first" = 1 ]; then
    echo "first deploy: the run engine is setting itself up (about 5 minutes), with this code already"
  elif [ "$(engine_state)" = "running" ]; then
    step "the run engine is on: give it the new code now"
    aws ssm send-command --instance-ids "$(out EngineInstanceId)" --document-name AWS-RunShellScript \
      --comment "evalix deploy" --parameters 'commands=["/usr/local/bin/evalix-update --restart"]' \
      --query Command.CommandId --output text \
      || echo "could not reach it now; it picks up the new code the next time it starts"
  else
    echo "the run engine is off; it picks up the new code the next time it starts"
  fi
}

deploy_frontend() {
  step "web app build + upload"
  (cd frontend && npm run build --silent)
  aws s3 sync frontend/dist/assets "s3://$WEB/assets" --delete --only-show-errors \
    --cache-control "public,max-age=31536000,immutable"
  aws s3 sync frontend/dist "s3://$WEB" --delete --only-show-errors --exclude "assets/*" \
    --exclude index.html --cache-control "public,max-age=86400"
  aws s3 cp frontend/dist/index.html "s3://$WEB/index.html" --only-show-errors --cache-control "no-cache"
  aws cloudfront create-invalidation --distribution-id "$(out DistributionId)" --paths "/*" \
    --query Invalidation.Id --output text >/dev/null
}

smoke() {
  local site
  site="$(out SiteUrl)"
  step "smoke check: $site"
  curl -fsS --max-time 15 "$site/" | grep -q 'id="root"' && echo "web app OK"
  curl -fsS --max-time 30 "$site/api/health" && echo
  curl -fsS --max-time 30 "$site/api/engine" && echo
  cat <<EOF

Evalix is at: $site
One-time step for Google sign-in: Google Cloud Console → your web client → Authorized JavaScript origins
→ add $site
EOF
}

case "$WHAT" in
  all) deploy_storage; check_secrets; upload_engine; deploy_app; deploy_frontend; smoke ;;
  backend) deploy_storage; check_secrets; upload_engine; deploy_app; smoke ;;
  frontend) deploy_frontend; smoke ;;
  status) echo "site: $(out SiteUrl)"; echo "run engine: $(engine_state)" ;;
  wake) aws ec2 start-instances --instance-ids "$(out EngineInstanceId)" --query 'StartingInstances[0].CurrentState.Name' --output text ;;
  stop) aws ec2 stop-instances --instance-ids "$(out EngineInstanceId)" --query 'StoppingInstances[0].CurrentState.Name' --output text ;;
  *) echo "usage: infra/deploy.sh [all|backend|frontend|status|wake|stop]" >&2; exit 2 ;;
esac
