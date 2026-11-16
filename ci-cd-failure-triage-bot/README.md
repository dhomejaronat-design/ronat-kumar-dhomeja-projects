# CI/CD Failure Triage Bot

When a test fails in CI, this bot reads the pytest log, sends it to an LLM through LangChain, and writes a plain-English explanation of what probably broke into the GitHub Actions job summary.

It also includes a small RAG service (FastAPI) that answers questions about the project docs.

**Stack:** Python, LangChain, Claude API, FastAPI, pytest, GitHub Actions, Docker

## How it works

1. **RAG service** (`app/`): loads the docs in `docs/`, finds the most relevant chunks for a question with keyword matching, and asks the LLM to answer from them. Endpoints: `GET /health`, `POST /ask`, `POST /triage` (interactive docs at `/docs`).
2. **Tests** (`tests/`): pytest suite that runs on every push in GitHub Actions on a fresh Ubuntu machine.
3. **Failure triage** (`triage.py`): if tests fail, the pipeline sends the log to the LLM and posts the explanation.

## The pipeline trick

A failed test normally stops the pipeline right away, so the triage step would never run. In the `triage-bot` job of `.github/workflows/tests.yml` (at the top of this repo):

```yaml
pytest -v > test-output.txt 2>&1 || echo "failed=true" >> $GITHUB_OUTPUT
```

`||` means "if the left side fails, run the right side". So a failure just raises a flag instead of stopping everything. The triage step runs when the flag is set, and the last step fails the build so the failure is still reported.

## Design decisions

- **Keyword matching instead of vector embeddings.** This keeps the project small and puts the depth into the CI/CD part. Embeddings would be the next upgrade for bigger docs.
- **Docker instead of Kubernetes.** One container is enough for one service.
- **Log trimming.** Only failure lines plus the end of the log go to the LLM, so big logs stay cheap and focused.
- **Tests don't need an API key.** They use a fake LLM, so CI runs free and doesn't depend on the network. 11 tests cover log trimming, keyword search, and every API endpoint.
- **The model is configurable** with the `MODEL` environment variable.

## Run it

```bash
pip install -r requirements.txt
pytest                                 # 11 tests
export ANTHROPIC_API_KEY=your_key
uvicorn app.main:app --reload          # http://localhost:8000/docs
python triage.py test-output.txt       # triage a saved log
```

With Docker:

```bash
docker build -t triage-bot .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=your_key triage-bot
```

## In GitHub Actions

This repo's workflow runs the bot on its own tests. If they pass, nothing else happens. If one fails, the log goes to the LLM and the explanation appears in the job summary, then the job is marked failed. Without an API key the triage step is skipped and the raw log is still shown.

To turn triage on, add `ANTHROPIC_API_KEY` under the repo's Settings, then Secrets and variables, then Actions.
