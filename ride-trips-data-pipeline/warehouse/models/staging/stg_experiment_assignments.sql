-- Which variant each rider was assigned to. One row per rider per experiment.
select
    cast(rider_id as bigint) as rider_id,
    experiment,
    variant
from read_csv('{{ var("data_dir") }}/raw/experiment_assignments.csv', header = true)
