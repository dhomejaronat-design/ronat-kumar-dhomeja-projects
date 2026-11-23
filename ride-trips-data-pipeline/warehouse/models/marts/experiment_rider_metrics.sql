-- One row per rider in the experiment: how many rides they requested and completed.
-- The rider is the unit of randomization, so the A/B analysis works at this grain.
select
    a.rider_id,
    a.experiment,
    a.variant,
    count(*)                                    as requests,
    count(*) filter (where f.is_completed)      as completed_trips
from {{ ref('fact_trips') }} f
join {{ ref('stg_experiment_assignments') }} a on a.rider_id = f.rider_id
group by all
