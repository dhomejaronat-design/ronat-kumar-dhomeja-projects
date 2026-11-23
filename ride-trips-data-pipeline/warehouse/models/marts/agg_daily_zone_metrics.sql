-- Daily metrics per pickup zone: demand, completion, revenue and wait times.
select
    f.trip_date,
    z.zone_id,
    z.zone_name,
    z.area,
    count(*)                                                   as requests,
    count(*) filter (where f.is_completed)                     as completed_trips,
    round(1 - count(*) filter (where f.is_completed) / count(*), 4) as cancel_rate,
    round(sum(f.fare) filter (where f.is_completed), 2)        as gross_fare,
    round(avg(f.fare) filter (where f.is_completed), 2)        as avg_fare,
    round(avg(f.duration_min) filter (where f.is_completed), 2) as avg_duration_min,
    round(quantile_cont(f.wait_min, 0.9) filter (where f.is_completed), 2) as p90_wait_min
from {{ ref('fact_trips') }} f
join {{ ref('dim_zones') }} z on z.zone_id = f.pickup_zone_id
group by all
