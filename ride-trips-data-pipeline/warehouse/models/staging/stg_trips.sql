-- One row per clean trip, read straight from the Parquet files the Spark job wrote.
select
    trip_id,
    cast(trip_date as date)       as trip_date,
    rider_id,
    driver_id,
    pickup_zone                   as pickup_zone_id,
    dropoff_zone                  as dropoff_zone_id,
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
from read_parquet('{{ var("data_dir") }}/clean/*/*.parquet', hive_partitioning = true)
