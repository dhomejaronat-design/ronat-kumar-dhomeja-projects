# Service runbook

The triage bot runs as a FastAPI service on port 8000. Start it with uvicorn app.main:app.

If the service returns a 500 error, check that ANTHROPIC_API_KEY is set in the environment.

Health checks hit GET /health, which returns ok and the number of loaded document chunks.

Docker builds use the Dockerfile in the project root. Run docker build -t triage-bot . then docker run -p 8000:8000 triage-bot.
