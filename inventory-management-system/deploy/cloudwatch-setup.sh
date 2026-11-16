#!/usr/bin/env bash
# Creates a CloudWatch metric that counts error log lines, and an alarm
# that fires when there are 5 or more errors in 5 minutes.
# Usage: REGION=ca-central-1 ./deploy/cloudwatch-setup.sh
set -euo pipefail
REGION="${REGION:?set REGION, for example ca-central-1}"
GROUP="/ecs/inventory-backend"

aws logs create-log-group --log-group-name "$GROUP" --region "$REGION" 2>/dev/null || true
aws logs put-retention-policy --log-group-name "$GROUP" --retention-in-days 14 --region "$REGION"

aws logs put-metric-filter --region "$REGION" \
  --log-group-name "$GROUP" \
  --filter-name inventory-errors \
  --filter-pattern '{ $.level = "error" }' \
  --metric-transformations metricName=ErrorCount,metricNamespace=Inventory,metricValue=1,defaultValue=0

aws logs put-metric-filter --region "$REGION" \
  --log-group-name "$GROUP" \
  --filter-name inventory-slow-requests \
  --filter-pattern '{ $.msg = "request" && $.ms > 1000 }' \
  --metric-transformations metricName=SlowRequests,metricNamespace=Inventory,metricValue=1,defaultValue=0

aws cloudwatch put-metric-alarm --region "$REGION" \
  --alarm-name inventory-errors-high \
  --namespace Inventory --metric-name ErrorCount \
  --statistic Sum --period 300 --evaluation-periods 1 \
  --threshold 5 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching

echo "CloudWatch metric filters and alarm created for $GROUP"
