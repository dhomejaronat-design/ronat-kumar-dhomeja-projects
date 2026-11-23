-- Trip fact table, loaded incrementally one day at a time.
--
-- unique_key = trip_date with delete+insert means a run deletes the whole day and
-- inserts it again, so re-running or backfilling a day never double-counts trips
-- and never leaves behind trips that the cleaning job has since rejected.
{{ config(materialized='incremental', unique_key='trip_date', incremental_strategy='delete+insert') }}

select
    trip_id,
    trip_date,
    rider_id,
    driver_id,
    pickup_zone_id,
    dropoff_zone_id,
    requested_at,
    pickup_at,
    dropoff_at,
    status,
    is_completed,
    distance_km,
    fare,
    duration_min,
    wait_min,
    fare_per_km
from {{ ref('stg_trips') }}
{% if is_incremental() %}
  {% if var('run_date') %}
where trip_date = date '{{ var("run_date") }}'
  {% else %}
where trip_date >= (select coalesce(max(trip_date), date '1900-01-01') from {{ this }})
  {% endif %}
{% endif %}
