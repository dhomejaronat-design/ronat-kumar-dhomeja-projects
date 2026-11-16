# CI pipeline

Every push runs the GitHub Actions workflow in .github/workflows/tests.yml (the triage-bot job) on a fresh Ubuntu runner.

The test step saves pytest output to test-output.txt. The || operator catches a failed test so the pipeline keeps going instead of stopping right away.

If tests failed, the triage step sends the log to the LLM and writes the explanation to the job summary. The last step then marks the build as failed.

Retrieval uses keyword matching, not vector embeddings, to keep the project small and focused on the CI/CD part.
