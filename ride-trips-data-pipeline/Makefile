PY ?= python
DAYS ?= 7
TRIPS ?= 150000

.PHONY: setup run report test clean

setup:            ## install dependencies (Java 17+ is needed for Spark)
	$(PY) -m pip install -r requirements.txt

run:              ## generate, clean, check and load DAYS days, then build the A/B report
	$(PY) -m pipeline.run --days $(DAYS) --trips $(TRIPS)
	$(PY) -m analysis.ab_test

report:           ## rebuild only the A/B report from the warehouse
	$(PY) -m analysis.ab_test

test:             ## unit tests, data-quality tests and an end-to-end run
	$(PY) -m pytest -q

clean:
	rm -rf data warehouse/target warehouse/logs logs spark-warehouse
