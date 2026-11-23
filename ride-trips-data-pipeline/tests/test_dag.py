from pathlib import Path

import pytest

airflow = pytest.importorskip("airflow")
from airflow.models import DagBag  # noqa: E402

DAGS = Path(__file__).resolve().parents[1] / "dags"


def test_dag_loads_with_tasks_in_order():
    bag = DagBag(dag_folder=str(DAGS), include_examples=False)
    assert not bag.import_errors
    dag = bag.get_dag("ride_trips_daily")
    order = ["land_raw_trips", "clean_with_spark", "quality_gate", "dbt_build", "experiment_report"]
    assert [t.task_id for t in dag.topological_sort()] == order
    assert dag.default_args["retries"] == 2
