-- Every completed trip needs a positive fare, distance and duration.
select trip_id
from {{ ref('fact_trips') }}
where is_completed
  and (fare is null or fare <= 0 or distance_km <= 0 or duration_min <= 0)
