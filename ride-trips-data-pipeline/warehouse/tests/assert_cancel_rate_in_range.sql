-- Rates must be between 0 and 1.
select trip_date, zone_id, cancel_rate
from {{ ref('agg_daily_zone_metrics') }}
where cancel_rate < 0 or cancel_rate > 1
