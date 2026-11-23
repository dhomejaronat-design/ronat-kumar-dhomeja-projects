-- The warehouse must hold exactly the trips the cleaning job produced, day by day.
with lake as (
    select trip_date, count(*) as n from {{ ref('stg_trips') }} group by 1
), wh as (
    select trip_date, count(*) as n from {{ ref('fact_trips') }} group by 1
)
select coalesce(lake.trip_date, wh.trip_date) as trip_date, lake.n as lake_rows, wh.n as warehouse_rows
from lake full outer join wh using (trip_date)
where lake.n is distinct from wh.n
