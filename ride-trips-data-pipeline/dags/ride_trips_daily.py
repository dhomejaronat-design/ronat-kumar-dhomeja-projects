"""Airflow DAG: run the ride-trips pipeline once a day.

    land_raw_trips -> clean_with_spark -> quality_gate -> dbt_build -> experiment_report

Every task works on the run's logical date ({{ ds }}), and every step overwrites only
that day, so a retry or a backfill (`airflow dags backfill`) is always safe.
If the quality gate fails, nothing reaches the warehouse.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator

PROJECT = os.environ.get("RIDE_TRIPS_HOME", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = f"{PROJECT}/data"
PY = os.environ.get("RIDE_TRIPS_PYTHON", "python")
TRIPS_PER_DAY = int(os.environ.get("RIDE_TRIPS_PER_DAY", "150000"))

default_args = {
    "owner": "data-eng",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "execution_timeout": timedelta(hours=1),
}

with DAG(
    dag_id="ride_trips_daily",
    description="Clean, check and load one day of ride trips, then refresh the A/B report.",
    start_date=datetime(2027, 5, 3),
    schedule="@daily",
    catchup=False,
    max_active_runs=1,
    default_args=default_args,
    tags=["rides", "spark", "dbt"],
) as dag:
    # In production this would be a sensor waiting for the app's export to land.
    # Here we generate the day's raw file so the whole pipeline runs end to end.
    land = BashOperator(
        task_id="land_raw_trips",
        bash_command=f"cd {PROJECT} && {PY} -m pipeline.generate --date {{{{ ds }}}} "
                     f"--trips {TRIPS_PER_DAY} --out {DATA}/raw",
    )

    clean = BashOperator(
        task_id="clean_with_spark",
        bash_command=f"cd {PROJECT} && {PY} -m pipeline.clean_spark --date {{{{ ds }}}} --data-dir {DATA}",
    )

    quality = BashOperator(
        task_id="quality_gate",
        bash_command=f"cd {PROJECT} && {PY} -m pipeline.quality --date {{{{ ds }}}} --data-dir {DATA}",
    )

    dbt_build = BashOperator(
        task_id="dbt_build",
        bash_command=(f"cd {PROJECT}/warehouse && WAREHOUSE_PATH={DATA}/warehouse.duckdb "
                      f"dbt build --profiles-dir . "
                      f"--vars \"{{data_dir: '{DATA}', run_date: '{{{{ ds }}}}'}}\""),
    )

    report = BashOperator(
        task_id="experiment_report",
        bash_command=f"cd {PROJECT} && {PY} -m analysis.ab_test --warehouse {DATA}/warehouse.duckdb "
                     f"--out {PROJECT}/docs/experiment_report.md",
    )

    land >> clean >> quality >> dbt_build >> report
