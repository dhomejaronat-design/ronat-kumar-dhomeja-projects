-- Calendar dimension covering every day that has trips.
with bounds as (
    select min(trip_date) as first_day, max(trip_date) as last_day from {{ ref('stg_trips') }}
)
select
    cast(d.day as date)                          as date_day,
    extract('year' from d.day)                   as year,
    extract('month' from d.day)                  as month,
    extract('day' from d.day)                    as day_of_month,
    dayname(d.day)                               as day_name,
    extract('isodow' from d.day) in (6, 7)       as is_weekend
from bounds,
     generate_series(bounds.first_day, bounds.last_day, interval 1 day) as d(day)
